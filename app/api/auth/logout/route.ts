/**
 * POST /api/auth/logout
 *
 * Clears the fc_session cookie. Idempotent — safe to call without an
 * existing session. Stateless server (no session store), so logout is just
 * "tell the browser to drop the cookie".
 *
 * Future hardening: when refresh tokens / token revocation list are added,
 * this is also where we'd record the revoked jti and write a
 * `logout` activities row.
 */
import { NextResponse } from 'next/server';
import { clearedSessionCookie } from '@/src/lib/auth/cookies';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const res = NextResponse.json({ success: true }, { status: 200 });
  res.cookies.set(clearedSessionCookie());
  return res;
}
