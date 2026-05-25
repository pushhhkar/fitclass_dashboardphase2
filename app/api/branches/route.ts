/**
 * GET /api/branches — live Google Sheets tab names for a dashboard.
 *
 * Role-aware visibility:
 *
 *  - admin                  → every tab in the sheet
 *  - manager / SSE          → tabs ∩ user.allowed_branches
 *                              (empty list = legacy unrestricted fallback)
 *  - sales_executive        → tabs ∩ (branches where SE has assignments)
 *                              — derived from `assignments.assigned_to`,
 *                              NOT from `allowed_branches`. See the inline
 *                              note for why this differs.
 *
 * Sheets remains the source of truth for which tabs exist; this endpoint
 * only DECIDES which of those tabs each user is allowed to see.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchTabNames } from '@/lib/sheets';
import { getSpreadsheetId } from '@/lib/dashboard-secrets';
import { requireSession } from '@/src/lib/auth/session';
import { filterAllowedBranches } from '@/src/lib/permissions/branches';
import { getDistinctBranchesForUser } from '@/src/features/assignments/queries';

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

    let visible: string[];

    if (session.role === 'sales_executive') {
      // ── SE branch visibility is OWNERSHIP-DERIVED ──────────────────────
      // Two failure modes the previous `filterAllowedBranches` path had for
      // SEs:
      //   1. SE with empty `allowed_branches` (admin direct-create flow)
      //      inherited "unrestricted" → saw every tab in the system.
      //   2. SE scoped to a branch where they had no leads saw the tab
      //      as a 0-row dead end (per-row filter restricts to ownership
      //      but tab list didn't agree).
      // Source of truth for SE is therefore `assignments.branch DISTINCT
      // WHERE assigned_to = SE.id`, intersected with the dashboard's
      // actual tabs (in case an assignment row references a renamed /
      // deleted tab).
      const assignedBranches = await getDistinctBranchesForUser(session.id);
      const assigned = new Set(assignedBranches);
      visible = tabs.filter((t) => assigned.has(t));
    } else {
      visible = filterAllowedBranches(session, tabs);
    }

    return NextResponse.json(visible);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GET /api/branches] dashboardId=%s error=%s', dashboardId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
