/**
 * Lead-level permissions — the PUBLIC API for everything that asks
 * "can this user do X to this lead?". Builds on the lower-level matrix
 * in `./assignments.ts` and the branch scopes in `./branches.ts`.
 *
 * ── Why backend filtering is MANDATORY ──────────────────────────────────────
 *  Frontend filtering ALONE leaks rows. Anything the server sends can be
 *  inspected: DevTools, curl, a stale cached response, a paginating UI
 *  scrolling past a hidden row. The server is the only place that knows
 *  with certainty what each user is allowed to see — so the server is the
 *  only place that decides what to return.
 *
 * ── Why assignment ownership is enforced server-side ────────────────────────
 *  An assignment is the contract between a sales user and the leads they
 *  are responsible for. If the client decided who saw what, a sales user
 *  could query an arbitrary `assigned_to` filter and exfiltrate the entire
 *  org's pipeline. By gating on the SERVER with the verified `session.id`
 *  there is no such surface.
 *
 * Each helper is pure and synchronous — feed it the SessionUser and the
 * lead's contextual facts (branch + current assignee id) and it returns
 * a boolean. No I/O, safe to call inside `.filter(...)` over a large list.
 */
import type { SessionUser } from '@/src/types/auth';
import { canAccessLeadBranch } from './branches';

/** Minimal lead facts needed for permission checks. */
export interface LeadContext {
  /** Sheet tab name = branch identifier. */
  branch: string;
  /** users.id of the current owner, or null when unassigned. */
  assignedToUserId?: string | null;
}

function isOwner(user: SessionUser, lead: LeadContext): boolean {
  return !!lead.assignedToUserId && lead.assignedToUserId === user.id;
}

/**
 * Can the user SEE this lead in a listing or detail view?
 *  - admin   → any
 *  - manager → in allowed branch
 *  - sales   → in allowed branch AND assigned to them
 */
export function canViewLeadData(
  user: SessionUser | null | undefined,
  lead: LeadContext,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!canAccessLeadBranch(user, lead.branch)) return false;
  if (user.role === 'manager') return true;
  // sales
  return isOwner(user, lead);
}

/**
 * Can the user EDIT lead fields (status, comments, etc.)?
 * Same matrix as view today; split kept so a future "read-only" role only
 * needs to change one helper.
 */
export function canEditLead(
  user: SessionUser | null | undefined,
  lead: LeadContext,
): boolean {
  return canViewLeadData(user, lead);
}

/**
 * Can the user TRANSFER this lead from its current branch to `targetBranch`?
 *  - admin   → any source, any target
 *  - manager → must own access to BOTH source and target branches
 *  - sales   → never (transfers are a manager operation)
 *
 * Returns false on null target so the API can default to "not allowed"
 * without a special case.
 */
export function canTransferLead(
  user: SessionUser | null | undefined,
  lead: LeadContext,
  targetBranch: string,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'manager') return false;
  return (
    canAccessLeadBranch(user, lead.branch) &&
    canAccessLeadBranch(user, targetBranch)
  );
}

/**
 * Can the user create/change/remove the assignment for this lead?
 *  - admin   → any branch
 *  - manager → only within their allowed branches
 *  - sales   → never
 */
export function canAssignLeadWithinBranch(
  user: SessionUser | null | undefined,
  lead: LeadContext,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'manager') return false;
  return canAccessLeadBranch(user, lead.branch);
}
