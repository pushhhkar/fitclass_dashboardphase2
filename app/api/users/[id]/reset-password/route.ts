/**
 * POST /api/users/[id]/reset-password — admin-only.
 *
 * Generates a fresh temporary password, stores its bcrypt hash on the user,
 * and returns the plaintext ONCE for the admin to hand off out-of-band.
 *
 * Future hardening: pair this with a "must_change_password" flag and force
 * the user through a change-password flow on first login (Phase 2F+).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireRoleApi } from '@/src/lib/permissions/api';
import { resetPasswordSchema } from '@/src/features/users/validators';
import { updateUser } from '@/src/features/users/mutations';
import { getUserById } from '@/src/features/users/queries';
import { hashPassword } from '@/src/lib/auth/password';
import { generateTemporaryPassword } from '@/src/features/users/password-gen';
import { logUserPasswordReset } from '@/src/features/activities/mutations';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const gate = await requireRoleApi('admin');
  if (!gate.ok) return gate.response;
  const actor = gate.session;

  const { id } = await ctx.params;

  // Body validation (currently must be empty/{} — schema is strict).
  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    // Empty body is fine — treat as {} for the strict schema.
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

  const temporaryPassword = generateTemporaryPassword();
  const password_hash = await hashPassword(temporaryPassword);

  await updateUser(id, { password_hash });
  await logUserPasswordReset(actor.id, id);

  return NextResponse.json({ temporaryPassword }, { status: 200 });
}
