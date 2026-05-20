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
import { ROLE_RANK } from '@/src/features/auth/constants';

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

/** Create / disable / re-role users. Admin-only. */
export function canManageUsers(user: SessionUser | null | undefined): boolean {
  return hasRole(user, 'admin');
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
  if (user.allowed_branches.length === 0) return true;
  return user.allowed_branches.includes(branch);
}

/** Read analytics dashboards. Admin-only today; revisit for managers later. */
export function canViewAnalytics(
  user: SessionUser | null | undefined,
): boolean {
  return hasRole(user, 'admin');
}
