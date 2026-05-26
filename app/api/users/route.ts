/**
 * /api/users — user management (Phase 2W hierarchy).
 *
 *   GET  → list users the actor is allowed to SEE (admin all, manager + SSE
 *          branch-scoped, SE self only). Gate: SSE+.
 *   POST → create a user. Gate: manager+. Server generates a temporary
 *          password returned ONCE in the response body.
 *
 * SECURITY (defence-in-depth):
 *  - GET stays at `senior_sales_executive` so SSE can view their team but
 *    POST tightens to `manager` — SSE has NO user-creation authority in
 *    Phase 2W.
 *  - `canCreateUser(actor.role, target.role)` enforces the routing matrix:
 *    admin → any role (incl admin); manager → any non-admin.
 *  - Non-admin actors cannot grant branches outside their own scope.
 *  - The denied attempt is recorded via `logPrivilegeDeniedAttempt`.
 *  - Branches are validated against the canonical Sheets-derived list.
 *  - Generic 409 on email conflict (no enumeration leak).
 *  - Password leaves the server exactly ONCE in the create response.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireMinimumRoleApi } from '@/src/lib/permissions/api';
import { canCreateUser, canViewUser } from '@/src/lib/permissions';
import { adminCreateUserSchema } from '@/src/features/users/validators';
import { createUser } from '@/src/features/users/mutations';
import { listUsers, getUserByEmail } from '@/src/features/users/queries';
import type { DatabaseUserInsert } from '@/src/types/database';
import { toSessionUser, toSessionUsers } from '@/src/features/users/serializers';
import { hashPassword } from '@/src/lib/auth/password';
import { generateTemporaryPassword } from '@/src/features/users/password-gen';
import {
  logPrivilegeDeniedAttempt,
  logUserCreated,
  sanitizeUserForAudit,
} from '@/src/features/activities/mutations';
import { isDatabaseError } from '@/src/lib/db/errors';
import { validateBranches } from '@/src/features/branches/queries';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const gate = await requireMinimumRoleApi('senior_sales_executive');
  if (!gate.ok) return gate.response;
  const actor = gate.session;

  const rows = await listUsers();
  // Phase 2P: visibility (canViewUser) is broader than edit authority
  // (canCreateUser). A manager SEES all SSEs + SEs in their branches but
  // can only EDIT SSEs. The UsersTable hides the Edit button per row
  // using `canCreateUser` so the API and the UI stay aligned.
  const visible = rows.filter((u) =>
    canViewUser(actor, {
      id: u.id,
      role: u.role,
      allowed_branches: u.allowed_branches,
    }),
  );
  return NextResponse.json(
    { users: toSessionUsers(visible) },
    { status: 200 },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Phase 2W: SSE has VIEW authority on users but NOT create. Manager+ only.
  const gate = await requireMinimumRoleApi('manager');
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

  // ── PRIVILEGE-ESCALATION GUARD ─────────────────────────────────────────
  // Even though the UI hides forbidden role options, a manager could craft
  // a POST with role='admin'. This is the authoritative reject.
  if (!canCreateUser(actor.role, input.role)) {
    await logPrivilegeDeniedAttempt(actor.id, 'create_user', {
      attempted_role: input.role,
      attempted_email: input.email,
    });
    return NextResponse.json(
      { error: 'You are not allowed to create a user with that role' },
      { status: 403 },
    );
  }

  // Phase 2W defence-in-depth: non-admin actors must only grant branches
  // they themselves own. UI already filters via /api/branches/all but a
  // crafted POST would otherwise let a manager mint a user with branches
  // outside their scope, escalating data access through their downline.
  if (actor.role !== 'admin') {
    const outside = input.allowed_branches.filter(
      (b) => !actor.allowed_branches.includes(b),
    );
    if (outside.length > 0) {
      await logPrivilegeDeniedAttempt(actor.id, 'create_user', {
        reason: 'branch_scope',
        attempted_role: input.role,
        attempted_email: input.email,
        outside_branches: outside,
      });
      return NextResponse.json(
        { error: 'You can only grant branches that are in your own scope' },
        { status: 403 },
      );
    }
  }

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
