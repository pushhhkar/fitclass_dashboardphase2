/**
 * Auth/RBAC constants — single source of truth.
 *
 * Pure, dependency-free, Edge-safe (imported by middleware). No `process.env`
 * reads, no Node APIs — keep it that way so the Edge bundle stays tiny.
 */

/**
 * Canonical role list. ORDER MATTERS: index ascends with privilege, so the
 * RBAC layer can do hierarchical checks (`ROLE_RANK[role] >= ROLE_RANK[min]`)
 * without a separate mapping. Add new roles here and `UserRole` updates
 * automatically via `typeof ROLES[number]`.
 *
 * The two "sales" roles split the field-operator tier:
 *  - sales_executive         → individual contributor handling leads
 *  - senior_sales_executive  → higher-rank IC; may absorb leads from juniors
 *  - manager                 → owns a branch; routes work to sales tier
 *  - admin                   → platform; routes anything anywhere
 *
 * NOTE on the DB enum: PostgreSQL keeps the legacy `'sales'` value in
 * `user_role` because enum values cannot be safely DROP'd. Existing rows
 * are migrated to `'sales_executive'` (see migration 20260522…) and the
 * app stops emitting the legacy name. JWTs minted before the migration
 * carry `role: 'sales'` and will fail `isUserRole(...)` on verify, forcing
 * the user to log in again — by design.
 */
export const ROLES = [
  'sales_executive',
  'senior_sales_executive',
  'manager',
  'admin',
] as const;

export const ROLE = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  SENIOR_SALES_EXECUTIVE: 'senior_sales_executive',
  SALES_EXECUTIVE: 'sales_executive',
} as const;

/** Privilege rank — higher = more power. */
export const ROLE_RANK: Record<(typeof ROLES)[number], number> = {
  sales_executive: 0,
  senior_sales_executive: 1,
  manager: 2,
  admin: 3,
};

/** Human labels for any place that renders a role to a user. */
export const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  sales_executive: 'Sales Executive',
  senior_sales_executive: 'Senior Sales Executive',
  manager: 'Manager',
  admin: 'Admin',
};

/** Default role assigned to a freshly-created user until changed by an admin. */
export const DEFAULT_ROLE = ROLE.SALES_EXECUTIVE;

/**
 * True for any role in the "sales" tier. Centralised so future role splits
 * (e.g. trainee_sales_executive) only need updating in one place. All other
 * permission code branches via this helper instead of literal-string checks.
 */
export function isSalesRole(role: (typeof ROLES)[number]): boolean {
  return role === 'sales_executive' || role === 'senior_sales_executive';
}

// ── JWT / session ───────────────────────────────────────────────────────────
/** Token lifetime, as a `jsonwebtoken` expiresIn string. */
export const JWT_EXPIRES_IN = '7d';
/** Same lifetime in seconds — used for cookie Max-Age and manual checks. */
export const JWT_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
/** Token issuer/audience claims — pin these to detect cross-system token reuse. */
export const JWT_ISSUER = 'fitclass-crm';
export const JWT_AUDIENCE = 'fitclass-crm:web';

/** Name of the HTTP-only cookie that carries the session token. */
export const AUTH_COOKIE_NAME = 'fc_session';

// ── Routes ──────────────────────────────────────────────────────────────────
export const AUTH_ROUTES = {
  /** Public sign-in page. */
  login: '/login',
  /** Authenticated landing area (all sub-paths protected). */
  dashboard: '/dashboard',
  /** Where to send users after logout. */
  afterLogout: '/login',
  /** Where to send users after successful login. */
  afterLogin: '/dashboard/leads',
} as const;

/** Path prefixes that require a valid session (pages + APIs). */
export const PROTECTED_PREFIXES = ['/dashboard', '/api'] as const;

/**
 * EXACT paths that require a valid session — used for routes that cannot be
 * expressed as a prefix without accidentally swallowing every other route.
 *
 * `/` belongs here: it is a session-aware redirect (server-only), but the
 * middleware enforces auth at the Edge so an unauthenticated client never
 * reaches the page at all. This is the second layer of defence behind
 * `app/page.tsx` itself — if anything ever causes that page redirect to
 * fail in production (stale build, transient session-lookup error), the
 * Edge gate still bounces the request to /login. There is no production
 * scenario in which the root URL serves CRM content publicly.
 */
export const PROTECTED_EXACT_PATHS = ['/'] as const;

/**
 * Paths that must stay publicly reachable even when unauthenticated.
 * `/api/auth/*` covers the login / logout / me endpoints so the middleware
 * never deadlocks the sign-in flow.
 */
export const PUBLIC_PATHS = ['/login', '/api/auth'] as const;
