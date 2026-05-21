/**
 * /dashboard/assignments — manager+ (admins see everything).
 *
 * Server-rendered list of current assignments visible to the user, plus the
 * pool of users they can assign to. Both lists are filtered SERVER-SIDE:
 *  - Admins → all assignments + all active users.
 *  - Managers → only assignments whose `branch` is in their allowed_branches,
 *    plus active users that share at least one branch (or are unrestricted).
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
  const actor = await requireMinimumRole('manager');

  // Visible assignments
  const rows =
    actor.role === 'admin' || actor.allowed_branches.length === 0
      ? await listAllAssignments()
      : await getAssignmentsForBranches(actor.allowed_branches);
  const assignments = toAssignmentViews(rows);

  // ── Candidate assignees ────────────────────────────────────────────────
  // Two filters apply:
  //   1. ROLE — `canAssignToUser(actor.role, target.role)` enforces the
  //      privilege-routing rule (admin→anyone, manager→sales only).
  //   2. BRANCH — for non-admin actors, target must overlap a branch with
  //      the actor (or be unrestricted with empty allowed_branches).
  //
  // SECURITY NOTE: this list is UX, not the gate. The same predicates run
  // server-side in POST/PATCH /api/assignments — a crafted POST to assign
  // to an admin will 403 even if the UI never shows that option.
  const allUsers = (await listUsers()).filter((u) => u.is_active);
  const candidates: SessionUser[] = allUsers
    .map(toSessionUser)
    .filter((u) => canAssignToUser(actor.role, u.role))
    .filter((u) => {
      if (actor.role === 'admin') return true;
      // manager: branch overlap (or target is unrestricted)
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
