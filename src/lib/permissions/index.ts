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
 * Whether the actor has ANY user-management authority at all.
 * After Phase 2M this is senior_sales_executive-or-above — admin creates
 * managers, manager creates SSEs, SSE creates sales_executives. Only
 * sales_executive has no user-creation authority. The fine-grained
 * "can actor create THIS role" check is `canCreateUser` below.
 */
export function canManageUsers(user: SessionUser | null | undefined): boolean {
  return hasMinimumRole(user, 'senior_sales_executive');
}

/**
 * Hierarchical user-creation authority (Phase 2P — admin is unconstrained
 * within non-admin roles; mid-tier remains strict one-level-down).
 *
 *   actor \ target │ admin │ manager │ senior_sales_exec │ sales_exec
 *   ───────────────┼───────┼─────────┼───────────────────┼────────────
 *   admin          │   ✗   │    ✓    │         ✓         │     ✓     ← broadened
 *   manager        │   ✗   │    ✗    │         ✓         │     ✗
 *   senior_sales_e │   ✗   │    ✗    │         ✗         │     ✓
 *   sales_executive│   ✗   │    ✗    │         ✗         │     ✗
 *
 * ── Why admin is broadened ─────────────────────────────────────────────────
 *  Phase 2M restricted admin to creating managers only (strict one-level-
 *  down). In practice that forced admins through the full chain (create
 *  manager → wait for them to create SSE → wait for them to create SE) just
 *  to onboard a sales executive. Phase 2P treats admin as the "bootstrap +
 *  repair" role: admins can mint any non-admin role directly when org
 *  structure is being established or repaired. The strict mid-tier chain
 *  (manager→SSE only, SSE→SE only) is preserved.
 *
 * ── Why no admin → admin ────────────────────────────────────────────────────
 *  Admins must be provisioned out-of-band (via the seed script). Mutual
 *  admin promotion in the app would let any compromised admin escalate the
 *  attacker's coverage. Use `npm run db:seed-admin` for new admins.
 *
 * ── Same rule covers EDIT, not just CREATE ─────────────────────────────────
 *  Editing a user's role is asserting a new role assignment. The PATCH
 *  handler calls this TWICE: against the target's CURRENT role (may the
 *  actor touch this user at all?) and against the patch's NEW role (may
 *  the actor place them there?). Both must be true.
 *
 * Pure 2-arg truth table — composes with the API role gate that proves the
 * actor's claimed role via the verified JWT.
 */
export function canCreateUser(
  actorRole: UserRole,
  targetRole: UserRole,
): boolean {
  if (targetRole === 'admin') return false;
  if (actorRole === 'admin') return true; // any non-admin target
  if (actorRole === 'manager') return targetRole === 'senior_sales_executive';
  if (actorRole === 'senior_sales_executive') return targetRole === 'sales_executive';
  return false;
}

/**
 * Who is the actor allowed to SEE in the user-management surface?
 *
 *  - admin → all users
 *  - manager → themselves + SSE/SE in branch overlap
 *  - SSE → themselves + SE in branch overlap
 *  - SE → only themselves
 *
 * Distinct from `canCreateUser` (the authority predicate): visibility is
 * broader than edit authority. A manager SEES the SEs in their branch
 * (operational oversight) but cannot EDIT them — the UsersTable hides the
 * Edit button for rows where `canCreateUser` returns false.
 *
 * Pure 2-argument predicate. Branch overlap is computed against the actor's
 * `allowed_branches`; unrestricted users (`allowed_branches = []`) only
 * appear if the actor is also unrestricted (admin) — prevents an
 * unrestricted SE from showing up in every manager's table.
 */
export function canViewUser(
  actor: SessionUser | null | undefined,
  target: { id: string; role: UserRole; allowed_branches: string[] },
): boolean {
  if (!actor) return false;
  if (actor.role === 'admin') return true;
  if (target.id === actor.id) return true; // always see self

  // Non-admin actors: target must overlap a branch.
  const overlaps =
    target.allowed_branches.length > 0 &&
    target.allowed_branches.some((b) => actor.allowed_branches.includes(b));
  if (!overlaps) return false;

  // Hierarchical visibility — only see DOWN the chain.
  if (actor.role === 'manager') {
    return target.role === 'senior_sales_executive' || target.role === 'sales_executive';
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
