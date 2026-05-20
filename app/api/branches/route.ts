import { NextRequest, NextResponse } from 'next/server';
import { fetchTabNames } from '@/lib/sheets';
import { getSpreadsheetId } from '@/lib/dashboard-secrets';

export const dynamic = 'force-dynamic';

// Returns the live tab names straight from Google Sheets.
// No hardcoded branch list — dashboard auto-discovers tabs.
//
// ── Branch-permission integration seam (Phase 2E+) ─────────────────────────
// When the legacy CRM is wired through the real auth flow, the response below
// should be filtered through the session user's allowed branches:
//
//   import { requireSession } from '@/src/lib/auth/session';
//   import { filterAllowedBranches } from '@/src/lib/permissions/branches';
//   const gate = await requireSession();
//   if (!gate.ok) return gate.response;
//   const tabs = await fetchTabNames(spreadsheetId);
//   return NextResponse.json(filterAllowedBranches(gate.session, tabs));
//
// Not enforced today: the route is on the LEGACY_CRM_PUBLIC_PATHS allow-list
// and many existing users have empty allowed_branches (treated as
// "unrestricted" by filterAllowedBranches), so this is a pure no-op until
// admins start populating branch scopes.
export async function GET(req: NextRequest) {
  const dashboardId = req.nextUrl.searchParams.get('dashboardId');

  if (!dashboardId) {
    return NextResponse.json({ error: 'dashboardId param is required' }, { status: 400 });
  }

  try {
    const spreadsheetId = getSpreadsheetId(dashboardId);
    const tabs = await fetchTabNames(spreadsheetId);
    return NextResponse.json(tabs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GET /api/branches] dashboardId=%s error=%s', dashboardId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
