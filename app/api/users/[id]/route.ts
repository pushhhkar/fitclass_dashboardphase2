/**
 * PATCH /api/users/[id] — manager+ user update (Phase 2H hierarchy).
 *
 * Supports partial updates of: name, role, allowed_branches, is_active.
 * Writes an audit row with before/after snapshots; password_hash never
 * appears in the snapshot (sanitiser strips it).
 *
 * ── Role authority guard (PRIVILEGE-ESCALATION) ─────────────────────────────
 * Editing a user IS a fresh role assertion. The check fires TWICE against
 * `canCreateUser`:
 *   1. Against the target's CURRENT role — "is the actor allowed to touch
 *      this user at all?". A manager cannot edit an admin / another manager,
 *      even just to rename them.
 *   2. Against the NEW role (when the patch includes one) — "can the actor
 *      put the user there?". A manager cannot promote a sales user to
 *      manager.
 * A denial logs `privilege_denied_attempt` and returns 403.
 *
 * ── Privilege-safety guards (prevent lockout) ───────────────────────────────
 *   1. Cannot demote yourself: an admin who accidentally changes their own
 *      role loses admin access and cannot undo it. (Managers cannot reach
 *      this branch because they can't edit themselves under the role rule.)
 *   2. Cannot deactivate yourself: same reasoning — instant self-lockout.
 *   3. Cannot remove the LAST active admin: the org needs at least one
 *      admin who can re-create / re-empower others.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireMinimumRoleApi } from '@/src/lib/permissions/api';
import { canCreateUser } from '@/src/lib/permissions';
import { adminUpdateUserSchema } from '@/src/features/users/validators';
import { updateUser } from '@/src/features/users/mutations';
import {
  getUserById,
  countActiveAdmins,
} from '@/src/features/users/queries';
import { toSessionUser } from '@/src/features/users/serializers';
import {
  logPrivilegeDeniedAttempt,
  logRoleChanged,
  logUserDeactivated,
  logUserReactivated,
  logUserUpdated,
  sanitizeUserForAudit,
} from '@/src/features/activities/mutations';
import { validateBranches } from '@/src/features/branches/queries';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const gate = await requireMinimumRoleApi('senior_sales_executive');
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

  // ── PRIVILEGE-ESCALATION GUARD (role authority) ────────────────────────
  // The actor must be allowed to "create" the target's CURRENT role
  // (= touch this user) AND the target's NEW role (= place them there).
  if (!canCreateUser(actor.role, target.role)) {
    await logPrivilegeDeniedAttempt(actor.id, 'update_user', {
      target_id: target.id,
      target_current_role: target.role,
    });
    return NextResponse.json(
      { error: 'You are not allowed to manage this user' },
      { status: 403 },
    );
  }
  if (patch.role !== undefined && !canCreateUser(actor.role, patch.role)) {
    await logPrivilegeDeniedAttempt(actor.id, 'update_user_role', {
      target_id: target.id,
      target_current_role: target.role,
      attempted_role: patch.role,
    });
    return NextResponse.json(
      { error: 'You are not allowed to promote a user to that role' },
      { status: 403 },
    );
  }

  // Defence-in-depth: validate the new branch list against the canonical
  // Sheets-derived names. Only runs when the patch actually mutates branches.
  if (patch.allowed_branches !== undefined) {
    const branchCheck = await validateBranches(patch.allowed_branches);
    if (!branchCheck.ok) {
      return NextResponse.json(
        {
          error: 'Some branches do not exist in the CRM',
          invalid_branches: branchCheck.invalid,
        },
        { status: 400 },
      );
    }
  }

  // ── Privilege-safety guards ────────────────────────────────────────────
  const isSelf = target.id === actor.id;

  if (isSelf && patch.role !== undefined && patch.role !== actor.role) {
    return NextResponse.json(
      { error: 'You cannot change your own role.' },
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
  // intent ("show me deactivations / role-changes") instead of diffing
  // snapshots manually.
  if (target.role !== updated.role) {
    await logRoleChanged(actor.id, updated.id, target.role, updated.role);
  }
  if (target.is_active && updated.is_active === false) {
    await logUserDeactivated(actor.id, updated.id);
  } else if (!target.is_active && updated.is_active === true) {
    await logUserReactivated(actor.id, updated.id);
  }

  return NextResponse.json({ user: toSessionUser(updated) }, { status: 200 });
}
