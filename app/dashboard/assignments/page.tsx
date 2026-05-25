/**
 * /dashboard/assignments — senior_sales_executive+ (Phase 2I).
 *
 * Server-rendered list of current assignments visible to the user, plus the
 * pool of users they can assign to. Both lists are filtered SERVER-SIDE:
 *  - Admins → all assignments + all active users.
 *  - Managers → assignments whose `branch` is in their allowed_branches,
 *    plus active users they may route work to (sales tier in branch).
 *  - Senior Sales Executives → assignments in their allowed_branches,
 *    plus active Sales Executives in branch (`canAssignToUser` returns
 *    true only for `sales_executive` when actor is SSE).
 *
 * The page revalidates on demand (`force-dynamic`) so router.refresh() inside
 * AssignLeadModal updates the table after any mutation.
 */
import { requireMinimumRole } from '@/src/lib/permissions/server';
import {
  getAssignmentsForBranches,
  listAllAssignments,
} from '@/src/features/assignments/queries';
import { listUsers } from '@/src/features/users/queries';
import { toAssignmentViews } from '@/src/features/assignments/serializers';
import { toSessionUser } from '@/src/features/users/serializers';
import { canAssignToUser } from '@/src/lib/permissions/assignments';
import AssignmentsClient from '@/components/assignments/AssignmentsClient';
import type { SessionUser } from '@/src/types/auth';

export const dynamic = 'force-dynamic';

export default async function AssignmentsPage() {
  // Lowest role with ANY assign authority is senior_sales_executive; the
  // fine-grained matrix runs below (and again server-side in the API).
  const actor = await requireMinimumRole('senior_sales_executive');

  // Visible assignments
  const rows =
    actor.role === 'admin' || actor.allowed_branches.length === 0
      ? await listAllAssignments()
      : await getAssignmentsForBranches(actor.allowed_branches);
  const assignments = toAssignmentViews(rows);

  // ── Candidate assignees ────────────────────────────────────────────────
  // Two filters apply:
  //   1. ROLE / IDENTITY — `canAssignToUser(actor.role, u.role, actor.id, u.id)`
  //      enforces the privilege-routing rule + admin-target ban + self-assign
  //      ban. (Phase 2L: admins are non-operational; nobody self-assigns.)
  //   2. BRANCH — for non-admin actors, target must overlap a branch with
  //      the actor (or be unrestricted with empty allowed_branches).
  //
  // SECURITY NOTE: this list is UX, not the gate. The same predicates run
  // server-side in POST/PATCH /api/assignments — a crafted POST to assign
  // to an admin (or to yourself) will 403 even if the UI never shows that
  // option.
  const allUsers = (await listUsers()).filter((u) => u.is_active);
  const candidates: SessionUser[] = allUsers
    .map(toSessionUser)
    .filter((u) => canAssignToUser(actor.role, u.role, actor.id, u.id))
    .filter((u) => {
      if (actor.role === 'admin') return true;
      // manager / SSE: branch overlap (or target is unrestricted)
      return (
        u.allowed_branches.length === 0 ||
        u.allowed_branches.some((b) => actor.allowed_branches.includes(b))
      );
    });

  return (
    // Card-page padding (the dashboard `<main>` is padding-free).
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <AssignmentsClient
        actor={actor}
        assignments={assignments}
        candidates={candidates}
      />
    </div>
  );
}
