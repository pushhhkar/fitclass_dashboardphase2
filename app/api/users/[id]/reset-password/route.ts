/**
 * POST /api/users/[id]/reset-password — manager+ (Phase 2H hierarchy).
 *
 * Generates a fresh temporary password, stores its bcrypt hash on the user,
 * and returns the plaintext ONCE for the actor to hand off out-of-band.
 *
 * Role-authority: the actor must be allowed to "create" the target's current
 * role (`canCreateUser`). A manager can reset passwords for sales-tier users
 * but never for admins or other managers — preventing a hostile manager
 * from locking out a peer/superior.
 *
 * Future hardening: pair this with a "must_change_password" flag and force
 * the user through a change-password flow on first login.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireMinimumRoleApi } from '@/src/lib/permissions/api';
import { canCreateUser } from '@/src/lib/permissions';
import { resetPasswordSchema } from '@/src/features/users/validators';
import { updateUser } from '@/src/features/users/mutations';
import { getUserById } from '@/src/features/users/queries';
import { hashPassword } from '@/src/lib/auth/password';
import { generateTemporaryPassword } from '@/src/features/users/password-gen';
import {
  logPrivilegeDeniedAttempt,
  logUserPasswordReset,
} from '@/src/features/activities/mutations';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  // Phase 2W: SSE cannot reset passwords. Manager+ only.
  const gate = await requireMinimumRoleApi('manager');
  if (!gate.ok) return gate.response;
  const actor = gate.session;

  const { id } = await ctx.params;

  // Body validation (currently must be empty/{} — schema is strict).
  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Role-authority gate — same as edit. Reject up-front so a manager can
  // never reset an admin's or another manager's credentials.
  if (!canCreateUser(actor.role, target.role)) {
    await logPrivilegeDeniedAttempt(actor.id, 'reset_user_password', {
      target_id: target.id,
      target_current_role: target.role,
    });
    return NextResponse.json(
      { error: 'You are not allowed to reset this user\'s password' },
      { status: 403 },
    );
  }

  const temporaryPassword = generateTemporaryPassword();
  const password_hash = await hashPassword(temporaryPassword);

  await updateUser(id, { password_hash });
  await logUserPasswordReset(actor.id, id);

  return NextResponse.json({ temporaryPassword }, { status: 200 });
}
