/**
 * Auth/RBAC constants — single source of truth.
 *
 * Pure, dependency-free, Edge-safe (imported by middleware). No `process.env`
 * reads, no Node APIs — keep it that way so the Edge bundle stays tiny.
 */

/**
 * Canonical role list. ORDER MATTERS: index ascends with privilege, so a
 * future RBAC layer can do hierarchical checks (e.g. `rank(role) >= rank(min)`)
 * without a separate mapping. Add new roles here and `UserRole` updates
 * automatically via `typeof ROLES[number]`.
 */
export const ROLES = ['sales', 'manager', 'admin'] as const;

export const ROLE = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  SALES: 'sales',
} as const;

/** Privilege rank for future hierarchical RBAC checks (higher = more power). */
export const ROLE_RANK: Record<(typeof ROLES)[number], number> = {
  sales: 0,
  manager: 1,
  admin: 2,
};

/** Default role assigned to a freshly-created user until changed by an admin. */
export const DEFAULT_ROLE = ROLE.SALES;

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
  afterLogin: '/dashboard',
} as const;

/** Path prefixes that require a valid session (pages + APIs). */
export const PROTECTED_PREFIXES = ['/dashboard', '/api'] as const;

/**
 * Paths that must stay publicly reachable even when unauthenticated.
 * `/api/auth` is reserved now for the future login/logout endpoints so the
 * middleware never deadlocks the sign-in flow.
 */
export const PUBLIC_PATHS = ['/login', '/api/auth'] as const;
