/**
 * Branch-scope permission helpers.
 *
 * The CRM uses Google Sheets tab names as branch identifiers (e.g. "Indiranagar",
 * "HSR Layout"). Each non-admin user can be scoped to one or more of these
 * branches via `users.allowed_branches`. Admins are unrestricted.
 *
 * This module is FOUNDATION-ONLY in Phase 2E. The legacy CRM routes do NOT
 * call these helpers yet (they'd break existing sessions whose users have
 * empty allowed_branches lists that the UI interprets as "unrestricted").
 * The wire-in plan is in src/lib/permissions/assignments.ts and at the
 * marked seams inside the legacy route handlers.
 *
 * Empty `allowed_branches` is treated as UNRESTRICTED (legacy compatibility).
 * Once a branch is added to a user's list, exclusion kicks in.
 */
import type { SessionUser } from '@/src/types/auth';

/**
 * Filter a list of branch names down to the ones a user may access.
 * Stable order: returns branches in their input order.
 */
export function filterAllowedBranches(
  user: SessionUser | null | undefined,
  branches: readonly string[],
): string[] {
  if (!user) return [];
  if (user.role === 'admin') return [...branches];
  if (user.allowed_branches.length === 0) return [...branches]; // legacy unrestricted
  const allowed = new Set(user.allowed_branches);
  return branches.filter((b) => allowed.has(b));
}

/**
 * True if the user may read/write data scoped to the given branch.
 * Mirrors `canAccessBranch` in ./index.ts; kept here so the assignments
 * module imports a single helper rather than mixing concerns.
 */
export function canAccessLeadBranch(
  user: SessionUser | null | undefined,
  branch: string,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.allowed_branches.length === 0) return true; // legacy unrestricted
  return user.allowed_branches.includes(branch);
}

/**
 * Throw-style guard for server handlers that prefer assertions to branches.
 * Use INSIDE a try/catch that converts BranchAccessError to a 403 response.
 */
export class BranchAccessError extends Error {
  readonly branch: string;
  constructor(branch: string) {
    super(`Access to branch "${branch}" denied`);
    this.name = 'BranchAccessError';
    this.branch = branch;
  }
}

export function assertBranchAccess(
  user: SessionUser | null | undefined,
  branch: string,
): void {
  if (!canAccessLeadBranch(user, branch)) {
    throw new BranchAccessError(branch);
  }
}
