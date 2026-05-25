/**
 * GET /api/users/assignable?branch=<branch>
 *
 * Returns the users the CURRENT actor is allowed to assign a lead to,
 * within the given branch. Powers the inline assignment picker on the
 * leads table — keeping the candidate query close to the row that needs
 * it instead of pre-loading every assignee for every branch.
 *
 * ── Authorization (server-authoritative, matches POST /api/assignments) ────
 *  1. `requireMinimumRoleApi('senior_sales_executive')` — lowest role with
 *     any assign authority. Sales Executives are rejected up front.
 *  2. `canAssignLeadWithinBranch(actor, { branch })` — actor must have
 *     branch authority. Returning the candidate list for a branch the
 *     actor can't act in would be misleading (the eventual POST would
 *     403); return 403 here instead.
 *  3. Per-candidate filter:
 *       a. `u.is_active` — never offer inactive users.
 *       b. `canAssignToUser(actor.role, u.role)` — admin→anyone,
 *          manager→sales tier, SSE→sales_executive only.
 *       c. branch overlap (admin actor skips this) — the target must
 *          share the branch (or be unrestricted) so an assignment is
 *          actually actionable for them.
 *
 *  This is the SAME predicate stack the POST /api/assignments handler
 *  applies before accepting an assignment, so a candidate returned here
 *  is guaranteed to be acceptable to the write API. The UI never trusts
 *  this; the write API re-checks.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireMinimumRoleApi } from '@/src/lib/permissions/api';
import { canAssignLeadWithinBranch } from '@/src/lib/permissions/leads';
import {
  canAssignLeadToBranch,
  canAssignToUser,
} from '@/src/lib/permissions/assignments';
import { listUsers } from '@/src/features/users/queries';
import { toSessionUsers } from '@/src/features/users/serializers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireMinimumRoleApi('senior_sales_executive');
  if (!gate.ok) return gate.response;
  const actor = gate.session;

  const branch = req.nextUrl.searchParams.get('branch');
  if (!branch) {
    return NextResponse.json({ error: 'branch param is required' }, { status: 400 });
  }

  if (!canAssignLeadWithinBranch(actor, { branch })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── BRANCH INTEGRITY (Phase 2K) ─────────────────────────────────────────
  // The previous version short-circuited `actor.role === 'admin'` to return
  // every active user regardless of branch scope. That let admins create
  // ghost assignments — a lead in branch "Sec 83" assigned to a user with
  // no "Sec 83" scope, who then couldn't see the lead they "owned".
  //
  // `canAssignLeadToBranch` enforces the rule uniformly (admin included).
  // Empty allowed_branches still means "unrestricted" — so an unrestricted
  // user shows up for every branch. The same predicate runs server-side in
  // POST /api/assignments, so a crafted POST that ignores this filter is
  // rejected with 403 regardless.
  // Picker candidates: same predicate stack the write API enforces, so a
  // candidate returned here is guaranteed acceptable to POST /api/assignments.
  //  - canAssignToUser  → role routing + admin-target ban + self-assign ban
  //  - canAssignLeadToBranch → assignee branch integrity (Phase 2K)
  const rows = (await listUsers()).filter((u) => u.is_active);
  const candidates = toSessionUsers(rows).filter(
    (u) =>
      canAssignToUser(actor.role, u.role, actor.id, u.id) &&
      canAssignLeadToBranch(u, branch),
  );

  return NextResponse.json({ users: candidates }, { status: 200 });
}
