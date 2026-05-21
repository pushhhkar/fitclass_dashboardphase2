/**
 * /api/users — admin-only user management.
 *
 *   GET  → list users (newest first), serialised to SessionUser shape so
 *          password_hash never leaves the server.
 *   POST → create a user; server generates a temporary password (returned
 *          ONCE in the response body for out-of-band sharing) and stores
 *          only its bcrypt hash. Logs `user_created` activity.
 *
 * SECURITY:
 *  - `requireRoleApi('admin')` is the only gate that authorises this
 *    endpoint. Frontend hiding (sidebar nav) is UX only — anyone with a
 *    valid session can hit this URL with curl; only admins succeed.
 *  - Generic 409 on email conflict (no information leakage about who exists).
 *  - Password leaves the server exactly ONCE, in the create response. It is
 *    never logged, never written to the audit row (sanitiser strips it),
 *    and never retrievable again.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireRoleApi } from '@/src/lib/permissions/api';
import { adminCreateUserSchema } from '@/src/features/users/validators';
import { createUser } from '@/src/features/users/mutations';
import { listUsers, getUserByEmail } from '@/src/features/users/queries';
import type { DatabaseUserInsert } from '@/src/types/database';
import { toSessionUser, toSessionUsers } from '@/src/features/users/serializers';
import { hashPassword } from '@/src/lib/auth/password';
import { generateTemporaryPassword } from '@/src/features/users/password-gen';
import {
  logUserCreated,
  sanitizeUserForAudit,
} from '@/src/features/activities/mutations';
import { isDatabaseError } from '@/src/lib/db/errors';
import { validateBranches } from '@/src/features/branches/queries';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const gate = await requireRoleApi('admin');
  if (!gate.ok) return gate.response;

  const users = await listUsers();
  return NextResponse.json({ users: toSessionUsers(users) }, { status: 200 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireRoleApi('admin');
  if (!gate.ok) return gate.response;
  const actor = gate.session;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = adminCreateUserSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Defence-in-depth: the UI sources branches from /api/branches/all, but a
  // crafted request could still POST an invalid string. Reject anything that
  // is not in the canonical Sheets-derived list so `canAccessLeadBranch`
  // never has to deal with non-existent tab names.
  const branchCheck = await validateBranches(input.allowed_branches);
  if (!branchCheck.ok) {
    return NextResponse.json(
      {
        error: 'Some branches do not exist in the CRM',
        invalid_branches: branchCheck.invalid,
      },
      { status: 400 },
    );
  }

  // Pre-check email to return a friendly 409 (also covers a unique-violation
  // race below as a safety net).
  const existing = await getUserByEmail(input.email);
  if (existing) {
    return NextResponse.json(
      { error: 'A user with that email already exists' },
      { status: 409 },
    );
  }

  const temporaryPassword = generateTemporaryPassword();
  const password_hash = await hashPassword(temporaryPassword);

  const payload: DatabaseUserInsert = {
    name: input.name,
    email: input.email,
    password_hash,
    role: input.role,
    allowed_branches: input.allowed_branches,
    is_active: true,
  };

  let created;
  try {
    created = await createUser(payload);
  } catch (err) {
    if (isDatabaseError(err) && err.kind === 'unique_violation') {
      return NextResponse.json(
        { error: 'A user with that email already exists' },
        { status: 409 },
      );
    }
    throw err;
  }

  await logUserCreated(actor.id, sanitizeUserForAudit(created));

  return NextResponse.json(
    {
      user: toSessionUser(created),
      // Plain-text temporary password — surfaced ONCE for the admin to
      // hand off to the new user. Never persisted, never logged.
      temporaryPassword,
    },
    { status: 201 },
  );
}
