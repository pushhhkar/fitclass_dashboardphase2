/**
 * GET /api/leads — list leads for a (dashboardId, sheetName) pair.
 *
 * Phase 2F enforcement (server-authoritative):
 *  1. Session required (401 if absent).
 *  2. Branch scope: `canAccessLeadBranch` — 403 if the user can't access the
 *     requested branch.
 *  3. Per-row ownership: `canViewLeadData` filters out leads a sales user
 *     doesn't own. Admin/manager see all rows in their allowed branches.
 *  4. Response is enriched with `assignments` (a map of rowIndex →
 *     AssignmentView) so the UI can render the current owner without a
 *     second round-trip.
 *
 * `canViewLeadData` returns false for sales-without-ownership, so a sales
 * user with no assignments in this branch sees an empty list — by design.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchLeads, fetchStatusOptions } from '@/lib/sheets';
import { getSpreadsheetId } from '@/lib/dashboard-secrets';
import { SEMANTIC_HEADERS } from '@/lib/config';
import type { Lead } from '@/types';
import { requireSession } from '@/src/lib/auth/session';
import { canAccessLeadBranch } from '@/src/lib/permissions/branches';
import { canViewLeadData } from '@/src/lib/permissions/leads';
import { makeLeadId } from '@/src/features/assignments/lead-id';
import { getAssignmentsByLeadIds } from '@/src/features/assignments/queries';
import { toAssignmentView, type AssignmentView } from '@/src/features/assignments/serializers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gate = await requireSession();
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const dashboardId = req.nextUrl.searchParams.get('dashboardId');
  const sheetName = req.nextUrl.searchParams.get('sheet');

  if (!dashboardId || !sheetName) {
    return NextResponse.json(
      { error: 'dashboardId and sheet params are required' },
      { status: 400 },
    );
  }

  // Branch-level gate before any I/O.
  if (!canAccessLeadBranch(session, sheetName)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const spreadsheetId = getSpreadsheetId(dashboardId);
    const { leads, headers } = await fetchLeads(spreadsheetId, sheetName);

    // Batch-fetch assignments for the rows we just pulled.
    const leadIds = leads.map((l) => makeLeadId(dashboardId, sheetName, l.rowIndex));
    const assignmentMap = await getAssignmentsByLeadIds(leadIds);

    // Per-row visibility filter. Admin/manager are passthroughs in-branch;
    // sales is filtered to assigned leads only.
    const visibleLeads: Lead[] = [];
    const assignmentsByRow: Record<number, AssignmentView> = {};
    for (const lead of leads) {
      const leadId = makeLeadId(dashboardId, sheetName, lead.rowIndex);
      const assignment = assignmentMap.get(leadId);
      const allowed = canViewLeadData(session, {
        branch: sheetName,
        assignedToUserId: assignment?.assigned_to ?? null,
      });
      if (!allowed) continue;
      visibleLeads.push(lead);
      if (assignment) {
        assignmentsByRow[lead.rowIndex] = toAssignmentView(assignment);
      }
    }

    // Status options are sheet-wide metadata, not per-row, so they don't
    // change with the filter.
    const statusColIndex = headers.indexOf(SEMANTIC_HEADERS.status);
    const statusOptions =
      statusColIndex !== -1
        ? await fetchStatusOptions(spreadsheetId, sheetName, statusColIndex)
        : [];

    return NextResponse.json({
      leads: visibleLeads,
      headers,
      statusOptions,
      assignments: assignmentsByRow,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GET /api/leads] dashboardId=%s sheet=%s error=%s', dashboardId, sheetName, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
