/**
 * PATCH /api/users/[id] — admin-only user update.
 *
 * Supports partial updates of: name, role, allowed_branches, is_active.
 * Writes an audit row with before/after snapshots; password_hash never
 * appears in the snapshot (sanitiser strips it).
 *
 * ── Privilege-safety guards (prevent lockout) ───────────────────────────────
 * These checks run BEFORE the update, in this order:
 *
 *   1. Cannot demote yourself.
 *      Why: an admin who accidentally changes their own role to "sales" loses
 *      access to /dashboard/users and cannot undo the change. The bypass
 *      requires another admin (good) or a DB shell (bad). Reject up-front.
 *
 *   2. Cannot deactivate yourself.
 *      Same reasoning — instant self-lockout.
 *
 *   3. Cannot remove the LAST active admin.
 *      Counts active admins; if changing this user's role away from 'admin'
 *      OR deactivating an active admin would drop the count to 0, reject.
 *      The org needs at least one admin who can re-create / re-empower others.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireRoleApi } from '@/src/lib/permissions/api';
import { adminUpdateUserSchema } from '@/src/features/users/validators';
import { updateUser } from '@/src/features/users/mutations';
import {
  getUserById,
  countActiveAdmins,
} from '@/src/features/users/queries';
import { toSessionUser } from '@/src/features/users/serializers';
import {
  logUserDeactivated,
  logUserReactivated,
  logUserUpdated,
  sanitizeUserForAudit,
} from '@/src/features/activities/mutations';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const gate = await requireRoleApi('admin');
  if (!gate.ok) return gate.response;
  const actor = gate.session;

  const { id } = await ctx.params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = adminUpdateUserSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const patch = parsed.data;

  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // ── Privilege-safety guards ────────────────────────────────────────────
  const isSelf = target.id === actor.id;

  if (isSelf && patch.role !== undefined && patch.role !== 'admin') {
    return NextResponse.json(
      { error: 'You cannot remove your own admin role.' },
      { status: 409 },
    );
  }

  if (isSelf && patch.is_active === false) {
    return NextResponse.json(
      { error: 'You cannot deactivate your own account.' },
      { status: 409 },
    );
  }

  // Last-admin protection: re-count active admins, then check whether the
  // proposed update would reduce that count to zero.
  const wasAdmin = target.role === 'admin' && target.is_active;
  const willBeAdminAfter =
    (patch.role !== undefined ? patch.role : target.role) === 'admin' &&
    (patch.is_active !== undefined ? patch.is_active : target.is_active);

  if (wasAdmin && !willBeAdminAfter) {
    const activeAdmins = await countActiveAdmins();
    if (activeAdmins <= 1) {
      return NextResponse.json(
        {
          error:
            'Cannot remove the last active admin. Promote another user to admin first.',
        },
        { status: 409 },
      );
    }
  }

  // Apply the update.
  const updated = await updateUser(id, patch);

  // Audit log with sanitised before/after snapshots.
  await logUserUpdated(
    actor.id,
    sanitizeUserForAudit(target),
    sanitizeUserForAudit(updated),
  );

  // Targeted convenience events so admins can search the audit log by
  // intent ("show me deactivations") instead of diffing snapshots.
  if (target.is_active && updated.is_active === false) {
    await logUserDeactivated(actor.id, updated.id);
  } else if (!target.is_active && updated.is_active === true) {
    await logUserReactivated(actor.id, updated.id);
  }

  return NextResponse.json({ user: toSessionUser(updated) }, { status: 200 });
}
