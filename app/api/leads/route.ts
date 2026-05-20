import { NextRequest, NextResponse } from 'next/server';
import { fetchLeads, fetchStatusOptions } from '@/lib/sheets';
import { getSpreadsheetId } from '@/lib/dashboard-secrets';
import { SEMANTIC_HEADERS } from '@/lib/config';

export const dynamic = 'force-dynamic';

// ── Branch-permission integration seam (Phase 2E+) ──────────────────────────
// When this route moves under real auth, drop in:
//
//   import { requireSession } from '@/src/lib/auth/session';
//   import { assertBranchAccess, BranchAccessError } from '@/src/lib/permissions/branches';
//   const gate = await requireSession();
//   if (!gate.ok) return gate.response;
//   try { assertBranchAccess(gate.session, sheetName); }
//   catch (err) {
//     if (err instanceof BranchAccessError)
//       return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
//     throw err;
//   }
//
// Per-row assignment ownership (sales sees only their leads) plugs in AFTER
// `fetchLeads` returns:
//   import { canViewLead } from '@/src/lib/permissions/assignments';
//   const visible = leads.filter(l => canViewLead(gate.session, {
//     branch: sheetName,
//     assignedToUserId: <joined from assignments table>,
//   }));
//
// Not enforced today: route is on LEGACY_CRM_PUBLIC_PATHS and assignments
// table isn't yet joined into the leads response.
export async function GET(req: NextRequest) {
  const dashboardId = req.nextUrl.searchParams.get('dashboardId');
  const sheetName   = req.nextUrl.searchParams.get('sheet');

  if (!dashboardId || !sheetName) {
    return NextResponse.json({ error: 'dashboardId and sheet params are required' }, { status: 400 });
  }

  try {
    const spreadsheetId = getSpreadsheetId(dashboardId);

    // fetchLeads now returns headers alongside leads — one API call for both.
    const { leads, headers } = await fetchLeads(spreadsheetId, sheetName);

    // Derive Status column index from live headers — no hardcoded offsets.
    const statusColIndex = headers.indexOf(SEMANTIC_HEADERS.status);
    const statusOptions = statusColIndex !== -1
      ? await fetchStatusOptions(spreadsheetId, sheetName, statusColIndex)
      : [];

    return NextResponse.json({ leads, headers, statusOptions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GET /api/leads] dashboardId=%s sheet=%s error=%s', dashboardId, sheetName, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
