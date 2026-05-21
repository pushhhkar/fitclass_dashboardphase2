/**
 * POST /api/transfer — move a lead row between Sheets tabs (branches).
 *
 * Phase 2F enforcement:
 *  - Session required.
 *  - `canTransferLead` ensures the actor has authority over BOTH the source
 *    branch and the target branch (so a manager can't off-load a lead into a
 *    branch they don't own). Sales role is rejected outright (transfers are
 *    a manager-only operation).
 *  - Best-effort audit (`logLeadTransferred`) records the lead's lineage.
 *
 * The existing assignment row (if any) keeps its `lead_id`; but the row's
 * rowIndex on the target sheet may differ from the source — Phase 2G will
 * decide whether to clear the assignment on cross-branch transfer or keep
 * it. For now the assignment is left untouched.
 */
import { NextRequest, NextResponse } from 'next/server';
import { transferLead } from '@/lib/sheets';
import { getSpreadsheetId } from '@/lib/dashboard-secrets';
import type { TransferPayload } from '@/types';
import { requireSession } from '@/src/lib/auth/session';
import { canTransferLead } from '@/src/lib/permissions/leads';
import { getLeadAssignment } from '@/src/features/assignments/queries';
import { makeLeadId } from '@/src/features/assignments/lead-id';
import { logLeadTransferred } from '@/src/features/activities/mutations';

export async function POST(req: NextRequest) {
  const gate = await requireSession();
  if (!gate.ok) return gate.response;
  const { session } = gate;

  let body: TransferPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { lead, targetSheetName, sourceSheetName, dashboardId } = body;
  if (!lead || !targetSheetName || !sourceSheetName || !dashboardId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (targetSheetName === sourceSheetName) {
    return NextResponse.json({ error: 'Target and source sheet cannot be the same' }, { status: 400 });
  }

  const leadId = makeLeadId(dashboardId, sourceSheetName, lead.rowIndex);
  const assignment = await getLeadAssignment(leadId);

  const allowed = canTransferLead(
    session,
    { branch: sourceSheetName, assignedToUserId: assignment?.assigned_to ?? null },
    targetSheetName,
  );
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const spreadsheetId = getSpreadsheetId(dashboardId);
    await transferLead({ lead, targetSheetName, sourceSheetName, dashboardId, spreadsheetId });

    await logLeadTransferred(session.id, leadId, sourceSheetName, targetSheetName);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/transfer]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
