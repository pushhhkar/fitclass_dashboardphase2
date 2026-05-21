/**
 * GET /api/branches — live Google Sheets tab names for a dashboard.
 *
 * Phase 2F: session-gated + branch-scoped.
 *  - `requireSession` returns 401 if no valid fc_session cookie.
 *  - `filterAllowedBranches` removes branches outside the user's scope.
 *    Empty allowed_branches still means "unrestricted" — see helper for the
 *    backward-compatibility rule.
 *  - No hardcoded branch list — Sheets remains the source of truth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchTabNames } from '@/lib/sheets';
import { getSpreadsheetId } from '@/lib/dashboard-secrets';
import { requireSession } from '@/src/lib/auth/session';
import { filterAllowedBranches } from '@/src/lib/permissions/branches';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessionGate = await requireSession();
  if (!sessionGate.ok) return sessionGate.response;
  const { session } = sessionGate;

  const dashboardId = req.nextUrl.searchParams.get('dashboardId');
  if (!dashboardId) {
    return NextResponse.json({ error: 'dashboardId param is required' }, { status: 400 });
  }

  try {
    const spreadsheetId = getSpreadsheetId(dashboardId);
    const tabs = await fetchTabNames(spreadsheetId);
    const visible = filterAllowedBranches(session, tabs);
    return NextResponse.json(visible);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GET /api/branches] dashboardId=%s error=%s', dashboardId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
