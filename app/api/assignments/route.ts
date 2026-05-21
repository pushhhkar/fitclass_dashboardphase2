/**
 * POST /api/assignments — create a new assignment for a lead that has none.
 *
 * Authorization (server-authoritative):
 *  - Caller must be admin or manager (sales has no assign rights).
 *  - Manager must have branch access to the lead's branch (`canAssignLeadWithinBranch`).
 *  - Target user must exist and be active.
 *  - Manager cannot assign across branches — both actor AND target user must
 *    have access to the same branch (a manager who has only ["A"] in their
 *    scope cannot assign a lead in branch "A" to a sales user whose scope is
 *    ["B"]). This prevents managers from leaking leads outside their reach.
 *
 *  All gates are server-side. Frontend hiding (sidebar nav) is UX only.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireMinimumRoleApi } from '@/src/lib/permissions/api';
import { canAssignLeadWithinBranch } from '@/src/lib/permissions/leads';
import { canAccessLeadBranch } from '@/src/lib/permissions/branches';
import { canAssignToUser } from '@/src/lib/permissions/assignments';
import { createAssignmentSchema } from '@/src/features/assignments/validators';
import { assignLead } from '@/src/features/assignments/mutations';
import { toAssignmentView } from '@/src/features/assignments/serializers';
import { getUserById } from '@/src/features/users/queries';
import { toSessionUser } from '@/src/features/users/serializers';
import { isDatabaseError } from '@/src/lib/db/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireMinimumRoleApi('manager');
  if (!gate.ok) return gate.response;
  const actor = gate.session;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createAssignmentSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Actor must be allowed to assign within this lead's branch.
  if (!canAssignLeadWithinBranch(actor, { branch: input.branch })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Resolve the target user. Must exist + active + (if non-admin actor) share
  // branch scope so a manager can't leak leads outside their territory.
  const targetRow = await getUserById(input.assigned_to);
  if (!targetRow || !targetRow.is_active) {
    return NextResponse.json(
      { error: 'Target user not found or inactive' },
      { status: 400 },
    );
  }
  const target = toSessionUser(targetRow);

  // Role-routing rule (PRIVILEGE-ESCALATION GUARD).
  // The frontend already filters the picker per `canAssignToUser`, but that
  // is UX only — a crafted POST could still try to escalate by assigning
  // a lead to an admin/manager. Reject those here, server-side, as the
  // authoritative gate.
  if (!canAssignToUser(actor.role, target.role)) {
    return NextResponse.json(
      { error: 'You cannot assign leads to a user with that role' },
      { status: 403 },
    );
  }

  if (actor.role !== 'admin' && !canAccessLeadBranch(target, input.branch)) {
    return NextResponse.json(
      { error: 'Target user is not scoped to this branch' },
      { status: 403 },
    );
  }

  try {
    const created = await assignLead({
      leadId: input.lead_id,
      branch: input.branch,
      assignedTo: input.assigned_to,
      assignedBy: actor.id,
      notes: input.notes ?? null,
    });
    return NextResponse.json(
      { assignment: toAssignmentView(created) },
      { status: 201 },
    );
  } catch (err) {
    if (isDatabaseError(err) && err.kind === 'unique_violation') {
      return NextResponse.json(
        {
          error:
            'This lead is already assigned. Use PATCH /api/assignments/{id} to reassign.',
        },
        { status: 409 },
      );
    }
    throw err;
  }
}
