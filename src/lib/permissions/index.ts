/**
 * Pure RBAC predicates — runtime-agnostic (server, client, Edge, tests).
 *
 * THIS FILE IS THE *POLICY*, NOT THE *ENFORCEMENT*. These functions answer
 * "is this allowed?" — they DO NOT redirect, throw, or return HTTP responses.
 * Enforcement happens at two places:
 *   - server pages/layouts → src/lib/permissions/server.ts (requireRole...)
 *   - API route handlers   → src/lib/auth/session.ts (requireSession) +
 *                            these predicates + your own NextResponse
 *
 * WHY FRONTEND-ONLY RBAC IS INSECURE:
 *   Anything we hide in the browser is still reachable by typing the URL,
 *   editing JS in DevTools, or calling the API directly with curl. The UI
 *   uses these predicates to hide buttons the user can't act on (UX);
 *   the SERVER must re-check before performing the action (security).
 *
 * No I/O, no async — every predicate is sync and side-effect-free so it can
 * be called inside render and tight loops without thought.
 */
import type { SessionUser, UserRole } from '@/src/types/auth';
import { ROLE_RANK, isSalesRole } from '@/src/features/auth/constants';
export { isSalesRole };

// ── Role identity / hierarchy ────────────────────────────────────────────────

export function hasRole(
  user: SessionUser | null | undefined,
  role: UserRole,
): boolean {
  return !!user && user.role === role;
}

/**
 * True when the user's privilege rank is >= the minimum required rank.
 * Hierarchy comes from ROLE_RANK (admin > manager > sales).
 */
export function hasMinimumRole(
  user: SessionUser | null | undefined,
  min: UserRole,
): boolean {
  if (!user) return false;
  return ROLE_RANK[user.role] >= ROLE_RANK[min];
}

// ── Action-level permissions ─────────────────────────────────────────────────
// These wrap role checks behind intent-named helpers so call sites read like
// the product requirement, not like an org chart. When permissions later
// become more granular (e.g. per-feature flags from the DB), the call sites
// don't change — only the body of the helper does.

/**
 * Whether the actor has ANY user-creation authority at all (Phase 2W).
 *
 * Admin + manager can mint users; SSE + SE cannot. This is the gate for the
 * user-creation API surface. The VIEW gate is `canManageUsersView` below —
 * SSE can list users (to see their team) without being able to create them.
 */
export function canManageUsers(user: SessionUser | null | undefined): boolean {
  return hasMinimumRole(user, 'manager');
}

/**
 * View-only gate for the user-management surface (Phase 2W).
 *
 * SSE can list users in their branch (so they see who reports to them),
 * but the row-level `canCreateUser` predicate decides whether the Edit
 * button is shown — for SSE it is always false. SE has no surface at all.
 */
export function canManageUsersView(
  user: SessionUser | null | undefined,
): boolean {
  return hasMinimumRole(user, 'senior_sales_executive');
}

/**
 * Hierarchical user-creation authority (Phase 2W — final spec).
 *
 *   actor \ target │ admin │ manager │ senior_sales_exec │ sales_exec
 *   ───────────────┼───────┼─────────┼───────────────────┼────────────
 *   admin          │   ✓   │    ✓    │         ✓         │     ✓
 *   manager        │   ✗   │    ✓    │         ✓         │     ✓
 *   senior_sales_e │   ✗   │    ✗    │         ✗         │     ✗
 *   sales_executive│   ✗   │    ✗    │         ✗         │     ✗
 *
 * ── Admin → admin is allowed ────────────────────────────────────────────────
 *  Phase 2W treats admin as fully self-sustaining: admins can mint other
 *  admins from the UI. The seed script remains the bootstrap mechanism for
 *  brand-new environments but is no longer the ONLY path to another admin.
 *  Compromise risk is accepted in exchange for operational flexibility —
 *  admins are already trusted with full data access, so the marginal
 *  privilege of creating peers is not a meaningful escalation.
 *
 * ── Manager creates any non-admin ──────────────────────────────────────────
 *  Managers run their branches end-to-end and need to onboard SSE + SE
 *  without admin involvement. They cannot mint admins.
 *
 * ── SSE and SE cannot create users ─────────────────────────────────────────
 *  Both roles are purely operational; org-structure changes require
 *  manager+ authority.
 *
 * ── Same rule covers EDIT, not just CREATE ─────────────────────────────────
 *  Editing a user's role is asserting a new role assignment. The PATCH
 *  handler calls this TWICE: against the target's CURRENT role (may the
 *  actor touch this user at all?) and against the patch's NEW role (may
 *  the actor place them there?). Both must be true.
 */
export function canCreateUser(
  actorRole: UserRole,
  targetRole: UserRole,
): boolean {
  if (actorRole === 'admin') return true; // admin → any role, including admin
  if (targetRole === 'admin') return false; // non-admins cannot mint admins
  if (actorRole === 'manager') return true; // manager → any non-admin
  return false; // SSE + SE have no user-creation authority
}

/**
 * Who is the actor allowed to SEE in the user-management surface? (Phase 2W)
 *
 *  - admin → all users
 *  - manager → themselves + any non-admin in branch overlap
 *  - SSE → themselves + SE in branch overlap (view-only)
 *  - SE → only themselves
 *
 * Distinct from `canCreateUser` (the authority predicate): visibility is
 * broader than edit authority. A manager SEES every non-admin in their
 * branch (operational oversight) but the UsersTable hides Edit for rows
 * where `canCreateUser` returns false.
 *
 * Branch overlap rule: targets with empty `allowed_branches` only appear
 * to admin — prevents an unrestricted user from showing up in every
 * manager's table.
 */
export function canViewUser(
  actor: SessionUser | null | undefined,
  target: { id: string; role: UserRole; allowed_branches: string[] },
): boolean {
  if (!actor) return false;
  if (actor.role === 'admin') return true;
  if (target.id === actor.id) return true; // always see self
  if (target.role === 'admin') return false; // non-admins never see admins

  const overlaps =
    target.allowed_branches.length > 0 &&
    target.allowed_branches.some((b) => actor.allowed_branches.includes(b));
  if (!overlaps) return false;

  if (actor.role === 'manager') {
    // target.role is already narrowed to non-admin above.
    return true;
  }
  if (actor.role === 'senior_sales_executive') {
    return target.role === 'sales_executive';
  }
  return false;
}

/** Assign leads to other users. Managers and above. */
export function canAssignLeads(user: SessionUser | null | undefined): boolean {
  return hasMinimumRole(user, 'manager');
}

/**
 * Branch-scoped data access. Foundation for multi-tenant lead isolation:
 *  - admin    → unrestricted by design
 *  - others   → allowed_branches empty == "no scope set yet, allow all"
 *               (legacy behaviour while branches are still seeded)
 *               otherwise the branch name must be on the user's list.
 *
 * `branch` is the Google-Sheets tab name — same identity used everywhere
 * else in the CRM (see config/dashboard-secrets / useBranches).
 */
export function canAccessBranch(
  user: SessionUser | null | undefined,
  branch: string,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.allowed_branches.length === 0) return true; // legacy unrestricted
  return user.allowed_branches.includes(branch);
}

/**
 * Strict "does this user explicitly OWN this branch?" — no admin special-
 * case, no empty-list bypass.
 *
 * Distinct from the two adjacent predicates:
 *  - `canAccessLeadBranch`   → admin yes, empty yes, else `includes`
 *                              (used for READ authority on lead data)
 *  - `canAssignLeadToBranch` → empty yes (unrestricted), else `includes`
 *                              (used to validate ASSIGNEE scope)
 *  - `ownsBranch`            → `includes` only — strict ownership check
 *                              (used to enforce "manager can only delegate
 *                               sheets they own"; empty must NOT be a bypass)
 *
 * Three slightly different predicates serving three different concerns —
 * never collapse them.
 */
export function ownsBranch(user: SessionUser, branch: string): boolean {
  return user.allowed_branches.includes(branch);
}

/** Read analytics dashboards. Admin-only today; revisit for managers later. */
export function canViewAnalytics(
  user: SessionUser | null | undefined,
): boolean {
  return hasRole(user, 'admin');
}
