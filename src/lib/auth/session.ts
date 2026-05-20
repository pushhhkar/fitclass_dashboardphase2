/**
 * Node-side session helpers for route handlers and server components.
 *
 * Uses the Node JWT verifier (`src/lib/auth/jwt.ts`) — middleware has its own
 * Edge-safe verifier (`jwt-edge.ts`). Both validate the same tokens; they
 * just run on different runtimes.
 *
 * WHY THE USER IS REVALIDATED FROM THE DATABASE:
 *  A JWT carries `role` and `sub` claims that are TRUE AS OF SIGNING. If an
 *  admin disables a user (`is_active = false`) or changes their role between
 *  sign-in and now, the token still says otherwise. Re-reading `users` here
 *  means deactivations/role changes take effect within at most one request
 *  cycle (or instantly for /me) — no token revocation list needed for the
 *  common cases. The DB hit is acceptable for protected endpoints; a lighter
 *  token-only fast-path (`getJwtPayload`) can be layered on later if a hot
 *  path proves the cost matters.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/src/features/auth/constants';
import { verifyJwt } from '@/src/lib/auth/jwt';
import { getUserById } from '@/src/features/users/queries';
import { toSessionUser } from '@/src/features/users/serializers';
import type { SessionUser } from '@/src/types/auth';

/** Read the raw session token from the request cookie, if any. */
export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(AUTH_COOKIE_NAME)?.value ?? null;
}

/**
 * Resolve the current session: verify the JWT, re-read the user from the DB,
 * reject if missing/inactive. Returns null for any failure (no throws).
 */
export async function getSessionFromRequest(): Promise<SessionUser | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const verified = verifyJwt(token);
  if (!verified.valid) return null;

  const user = await getUserById(verified.payload.sub);
  if (!user || !user.is_active) return null;

  return toSessionUser(user);
}

/**
 * Discriminated guard for API route handlers. Usage:
 *
 *   const gate = await requireSession();
 *   if (!gate.ok) return gate.response;
 *   // gate.session is SessionUser
 */
export type SessionGate =
  | { ok: true; session: SessionUser }
  | { ok: false; response: NextResponse };

export async function requireSession(): Promise<SessionGate> {
  const session = await getSessionFromRequest();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true, session };
}
