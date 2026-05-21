/**
 * PATCH /api/sheets — update a single Status or Comments cell on a lead row.
 *
 * Phase 2F enforcement:
 *  - Session required (401).
 *  - Branch + ownership gate via `canEditLead`. Sales can only edit leads
 *    assigned to them; manager edits in-branch; admin edits anything.
 *  - Status changes are audit-logged with before/after via `logStatusChange`
 *    (best-effort, never throws into the response path).
 */
import { NextRequest, NextResponse } from 'next/server';
import { updateCell } from '@/lib/sheets';
import { getSpreadsheetId } from '@/lib/dashboard-secrets';
import type { UpdatePayload } from '@/types';
import { requireSession } from '@/src/lib/auth/session';
import { canEditLead } from '@/src/lib/permissions/leads';
import { getLeadAssignment } from '@/src/features/assignments/queries';
import { makeLeadId } from '@/src/features/assignments/lead-id';
import { logStatusChange } from '@/src/features/activities/mutations';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  const gate = await requireSession();
  if (!gate.ok) return gate.response;
  const { session } = gate;

  let body: UpdatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rowIndex, field, value, dashboardId, sheetName } = body;

  if (!rowIndex || !field || value === undefined || !dashboardId || !sheetName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (field !== 'Status' && field !== 'Comments') {
    return NextResponse.json({ error: 'field must be Status or Comments' }, { status: 400 });
  }

  // Resolve assignment + verify edit permission BEFORE touching Sheets.
  const leadId = makeLeadId(dashboardId, sheetName, rowIndex);
  const assignment = await getLeadAssignment(leadId);
  const allowed = canEditLead(session, {
    branch: sheetName,
    assignedToUserId: assignment?.assigned_to ?? null,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const spreadsheetId = getSpreadsheetId(dashboardId);
    await updateCell({ rowIndex, field, value, dashboardId, sheetName, spreadsheetId });

    // Best-effort audit: status changes get a structured row; comments are
    // noisier so we skip them here (callers can opt in later if needed).
    if (field === 'Status') {
      await logStatusChange(session.id, leadId, { field, value: null }, { field, value });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/sheets]', err);
    return NextResponse.json({ error: 'Failed to update sheet' }, { status: 500 });
  }
}
