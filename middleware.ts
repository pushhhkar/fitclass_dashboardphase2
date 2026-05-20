/**
 * Route-protection middleware — FOUNDATION ONLY (Phase 2, Step 2).
 *
 * ── Why this file lives at the project ROOT (not src/) ──────────────────────
 * Next.js only executes middleware whose file sits at the SAME level as the
 * router. This project's App Router is at `./app` (not `./src/app`), so the
 * active middleware MUST be `./middleware.ts`. A `src/middleware.ts` would be
 * silently ignored by the framework. All other foundation code lives under
 * `src/` as designed; only this entrypoint is pinned to the root by Next.js.
 *
 * ── Edge-safe by construction ───────────────────────────────────────────────
 * Runs on the Edge runtime. It imports ONLY `next/server` + pure constants —
 * NO `jsonwebtoken`, NO Supabase, NO Node `crypto`. Today it performs a
 * structural PRESENCE check of the session cookie and enforces the protected-
 * route map. It deliberately does NOT cryptographically verify the JWT yet
 * (that is server-side in `src/lib/auth/jwt.ts`), per the Step-2 scope.
 *
 * ── Future RBAC expansion (next steps) ──────────────────────────────────────
 * 1. Swap the presence check for an Edge-native verify (`jose`) so the token
 *    signature/expiry is validated here without a Node round-trip.
 * 2. Read `role` from the verified payload and gate route groups, e.g.
 *    `/dashboard/admin/*` → role === 'admin', using `ROLE_RANK` for
 *    hierarchical checks. The route map below is the single place that grows.
 * 3. Attach the decoded user to request headers for downstream handlers.
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  AUTH_ROUTES,
  PROTECTED_PREFIXES,
  PUBLIC_PATHS,
} from '@/src/features/auth/constants';

// ─────────────────────────────────────────────────────────────────────────────
// TODO: REMOVE PUBLIC ACCESS AFTER PHASE 2C AUTH IMPLEMENTATION
//
// WHY THIS EXISTS:
//   The JWT login flow (POST /api/auth/login → set fc_session cookie) is not
//   implemented yet. Until it is, every unauthenticated request to the CRM
//   APIs returns 401 and the dashboard breaks. Rather than rip out the auth
//   foundation, we temporarily whitelist the legacy CRM surface so development
//   can continue unblocked.
//
// WHAT TO DO IN PHASE 2C:
//   1. Implement the login API + cookie-setting (POST /api/auth/login).
//   2. Build the login page so users can obtain a session.
//   3. Delete the LEGACY_CRM_PUBLIC_PATHS array below entirely.
//   4. The permanent PUBLIC_PATHS + PROTECTED_PREFIXES in constants.ts then
//      take over and RBAC enforcement activates for every route.
//
// SECURITY NOTE:
//   This bypass is local to the Edge middleware. The server-side
//   `requireSession()` guard in each API route handler was also removed during
//   Phase 2A revert — APIs are genuinely public right now. Re-add those guards
//   (src/lib/auth/guard.ts) to each route handler in Phase 2C alongside the
//   login implementation.
// ─────────────────────────────────────────────────────────────────────────────
const LEGACY_CRM_PUBLIC_PATHS = [
  '/',              // CRM dashboard shell
  '/api/leads',     // lead data + status options
  '/api/branches',  // dynamic tab/branch discovery
  '/api/sheets',    // status/comments cell updates
  '/api/transfer',  // lead transfer between branches
] as const;

function isLegacyCrmPath(pathname: string): boolean {
  return LEGACY_CRM_PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isProtected(pathname: string): boolean {
  // TODO: REMOVE isLegacyCrmPath check AFTER PHASE 2C AUTH IMPLEMENTATION
  if (isLegacyCrmPath(pathname)) return false;

  // Permanent public allow-list (login page, future /api/auth/* endpoints).
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  // Foundation check: presence + non-empty session cookie. Cryptographic
  // verification is intentionally deferred to the Node server layer.
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const hasToken = typeof token === 'string' && token.length > 0;

  if (hasToken) {
    return NextResponse.next();
  }

  // Unauthenticated + API → 401 JSON (clean error for fetch callers).
  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Unauthenticated + page → redirect to login, preserving intended target.
  const loginUrl = new URL(AUTH_ROUTES.login, req.nextUrl.origin);
  loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

/**
 * Run middleware on everything EXCEPT Next.js internals and static assets.
 * Route-level public/protected logic is decided in `isProtected` above so the
 * policy stays in one readable place rather than encoded in this regex.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
};
