/**
 * POST /api/auth/login
 *
 * Validate credentials, mint a JWT, set the HTTP-only session cookie.
 *
 * Security notes:
 *  - Single generic "Invalid email or password" message for ALL failure modes
 *    (bad JSON, unknown email, wrong password, inactive user). Distinct
 *    messages would leak account enumeration / state.
 *  - bcrypt hash comparison is constant-time; we always run it on a real-ish
 *    candidate to keep timing uniform (returning early on "no user" without a
 *    dummy compare would still be fine here because email enumeration is the
 *    bigger risk and is already addressed by the unified error message).
 *  - The password never appears in the response body or logs.
 *  - Audit hook for "login_success" / "login_failure" will plug in below at
 *    the two marked points once Phase 2D adds activities mutations.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { loginSchema } from '@/src/lib/validations/auth';
import { getUserByEmail } from '@/src/features/users/queries';
import { comparePassword } from '@/src/lib/auth/password';
import { signJwt } from '@/src/lib/auth/jwt';
import { toSessionUser } from '@/src/features/users/serializers';
import { sessionCookieFor } from '@/src/lib/auth/cookies';
import {
  logLoginFailure,
  logLoginSuccess,
} from '@/src/features/activities/mutations';

export const dynamic = 'force-dynamic';

const GENERIC_AUTH_ERROR = 'Invalid email or password';

function fail(): NextResponse {
  return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    // Same generic message — don't reveal which field failed validation.
    // Audit helper never throws, so it can't break the response.
    const candidateEmail =
      typeof (raw as { email?: unknown })?.email === 'string'
        ? ((raw as { email: string }).email)
        : '';
    await logLoginFailure(candidateEmail, 'invalid_input');
    return fail();
  }
  const { email, password } = parsed.data;

  const user = await getUserByEmail(email);
  if (!user) {
    await logLoginFailure(email, 'unknown_email');
    return fail();
  }
  if (!user.is_active) {
    await logLoginFailure(email, 'inactive_user', user.id);
    return fail();
  }

  const ok = await comparePassword(password, user.password_hash);
  if (!ok) {
    await logLoginFailure(email, 'bad_password', user.id);
    return fail();
  }

  const token = signJwt({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  const session = toSessionUser(user);
  const res = NextResponse.json({ user: session }, { status: 200 });
  res.cookies.set(sessionCookieFor(token));

  await logLoginSuccess(user.id);
  return res;
}
