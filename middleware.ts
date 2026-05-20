/**
 * Route-protection middleware — Phase 2C (cryptographic JWT verify).
 *
 * ── Why this file lives at the project ROOT (not src/) ──────────────────────
 * Next.js only executes middleware whose file sits at the SAME level as the
 * router. This project's App Router is at `./app`, so the active middleware
 * MUST be `./middleware.ts`. A `src/middleware.ts` would be silently ignored.
 *
 * ── Edge runtime ────────────────────────────────────────────────────────────
 * Runs on the Edge. The token verifier uses `jose` (WebCrypto) — see
 * src/lib/auth/jwt-edge.ts for why we cannot use `jsonwebtoken` here.
 *
 * ── Flow ────────────────────────────────────────────────────────────────────
 *  1. Match all paths except Next.js internals and static assets.
 *  2. Decide protected/public via `isProtected` (one readable place, not a
 *     regex). The route map in src/features/auth/constants.ts is the single
 *     source of truth.
 *  3. For protected paths: cryptographically verify the fc_session JWT
 *     (signature + expiry + iss + aud). Invalid → clear the bad cookie and
 *     redirect / 401. Valid → pass through.
 *  4. Future RBAC plug-in point is marked inline below.
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  AUTH_ROUTES,
  PROTECTED_PREFIXES,
  PUBLIC_PATHS,
} from '@/src/features/auth/constants';
import { verifyJwtEdge } from '@/src/lib/auth/jwt-edge';

// ─────────────────────────────────────────────────────────────────────────────
// TODO: REMOVE PUBLIC ACCESS AFTER PHASE 2C/2D FRONTEND MIGRATION
//
// Reason for keeping the legacy bypass IN PHASE 2C:
//   The login API + page now exist, but the legacy CRM at `/` does not yet
//   call /api/auth/login on its own (Phase 2D wires it up). Removing this
//   bypass today would block every existing CRM user mid-session. The bypass
//   is now intentionally narrower than Phase 2B — only the legacy shell and
//   its four data APIs remain public; everything else (incl. /dashboard, all
//   future /api/* endpoints) is fully protected by the verifier above.
//
// Removal checklist (Phase 2D):
//   1. Make the legacy `/` shell require a real session (or replace with
//      /dashboard and delete the root page).
//   2. Delete LEGACY_CRM_PUBLIC_PATHS + isLegacyCrmPath below.
//   3. Optionally re-add server-side requireSession() guards in each route
//      handler as defence-in-depth (see src/lib/auth/session.ts).
// ─────────────────────────────────────────────────────────────────────────────
const LEGACY_CRM_PUBLIC_PATHS = [
  '/',              // legacy CRM shell
  '/api/leads',
  '/api/branches',
  '/api/sheets',
  '/api/transfer',
] as const;

function isLegacyCrmPath(pathname: string): boolean {
  return LEGACY_CRM_PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isProtected(pathname: string): boolean {
  // TODO: REMOVE isLegacyCrmPath check AFTER PHASE 2D FRONTEND MIGRATION
  if (isLegacyCrmPath(pathname)) return false;

  // Permanent public allow-list: /login + /api/auth/* (login/logout/me).
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function unauthenticated(req: NextRequest, hadToken: boolean): NextResponse {
  const { pathname, search, origin } = req.nextUrl;

  // APIs get a clean JSON 401 (not an HTML redirect).
  if (pathname.startsWith('/api')) {
    const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (hadToken) res.cookies.delete(AUTH_COOKIE_NAME);
    return res;
  }

  // Pages get redirected to /login, preserving the intended target.
  const loginUrl = new URL(AUTH_ROUTES.login, origin);
  loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`);
  const res = NextResponse.redirect(loginUrl);
  if (hadToken) res.cookies.delete(AUTH_COOKIE_NAME);
  return res;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  if (!isProtected(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return unauthenticated(req, false);
  }

  const verified = await verifyJwtEdge(token);
  if (!verified.valid) {
    return unauthenticated(req, true); // clear the bad cookie on the way out
  }

  // ── Role extraction (verified, trustworthy at the Edge) ───────────────────
  // The token signature + iss + aud + exp have been checked. `role` and `sub`
  // are now trustworthy WITHOUT a DB round-trip — useful for cheap per-prefix
  // gating below.
  const role = verified.payload.role; // 'admin' | 'manager' | 'sales'
  void role; // currently unused at the Edge — see RBAC notes below.

  // ── Future RBAC route-group gating ────────────────────────────────────────
  // Phase 2D intentionally does NOT enforce role at the Edge. Authoritative
  // enforcement lives Node-side, where it can ALSO re-read the user's CURRENT
  // role/is_active (the JWT is point-in-time):
  //   - server components / pages → src/lib/permissions/server.ts
  //                                 (requireRole / requireMinimumRole)
  //   - API route handlers        → src/lib/auth/session.ts (requireSession)
  //                                 + predicates in src/lib/permissions
  //
  // When a hot path needs sub-millisecond gate-out (no Node bounce), add an
  // edge rule HERE, sourced from a single route map. Sketch:
  //
  //   import { ROLE_RANK } from '@/src/features/auth/constants';
  //   const EDGE_RBAC: ReadonlyArray<{ prefix: string; minRank: number }> = [
  //     { prefix: '/dashboard/admin', minRank: ROLE_RANK.admin },
  //     { prefix: '/api/admin',       minRank: ROLE_RANK.admin },
  //   ];
  //   const rule = EDGE_RBAC.find(r => pathname.startsWith(r.prefix));
  //   if (rule && ROLE_RANK[role] < rule.minRank) return forbidden(req);
  //
  // ── Branch-scoped RBAC (foundation) ───────────────────────────────────────
  // The JWT carries role but NOT allowed_branches (kept off the wire so the
  // cookie stays small and so revoking a branch takes effect immediately).
  // Branch checks therefore stay on the Node side via canAccessBranch() in
  // src/lib/permissions, which reads the freshly-loaded SessionUser.

  return NextResponse.next();
}

/**
 * Run middleware on everything EXCEPT Next.js internals and static assets.
 * Protected vs public is decided in `isProtected` above.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
};
