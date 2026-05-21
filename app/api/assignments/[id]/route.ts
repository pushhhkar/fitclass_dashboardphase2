/**
 * PATCH  /api/assignments/[id] — reassign to a new user
 * DELETE /api/assignments/[id] — unassign (lead returns to unowned)
 *
 * Authorization rules mirror POST (see ../route.ts):
 *  - admin or manager only
 *  - manager must have branch access to the assignment's branch
 *  - manager reassign target must also be branch-scoped to the same branch
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireMinimumRoleApi } from '@/src/lib/permissions/api';
import { canAssignLeadWithinBranch } from '@/src/lib/permissions/leads';
import { canAccessLeadBranch } from '@/src/lib/permissions/branches';
import { canAssignToUser } from '@/src/lib/permissions/assignments';
import { updateAssignmentSchema } from '@/src/features/assignments/validators';
import {
  reassignLead,
  unassignLead,
} from '@/src/features/assignments/mutations';
import { getAssignmentById } from '@/src/features/assignments/queries';
import { toAssignmentView } from '@/src/features/assignments/serializers';
import { getUserById } from '@/src/features/users/queries';
import { toSessionUser } from '@/src/features/users/serializers';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const gate = await requireMinimumRoleApi('manager');
  if (!gate.ok) return gate.response;
  const actor = gate.session;

  const { id } = await ctx.params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = updateAssignmentSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const existing = await getAssignmentById(id);
  if (!existing) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  // Actor must have authority over this lead's branch.
  if (!canAssignLeadWithinBranch(actor, { branch: existing.branch })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Resolve new owner; must be active, role-compatible, and (for managers)
  // branch-compatible.
  const targetRow = await getUserById(input.assigned_to);
  if (!targetRow || !targetRow.is_active) {
    return NextResponse.json(
      { error: 'Target user not found or inactive' },
      { status: 400 },
    );
  }
  const target = toSessionUser(targetRow);

  // Role-routing rule (PRIVILEGE-ESCALATION GUARD).
  // A reassign carries the same risk as a fresh assign: a manager could
  // try to PATCH an existing row's `assigned_to` to an admin or another
  // manager. Reject role-incompatible targets here, server-side.
  if (!canAssignToUser(actor.role, target.role)) {
    return NextResponse.json(
      { error: 'You cannot assign leads to a user with that role' },
      { status: 403 },
    );
  }

  if (actor.role !== 'admin' && !canAccessLeadBranch(target, existing.branch)) {
    return NextResponse.json(
      { error: 'Target user is not scoped to this branch' },
      { status: 403 },
    );
  }

  const updated = await reassignLead({
    id,
    assignedTo: input.assigned_to,
    actorId: actor.id,
    notes: input.notes ?? null,
  });
  return NextResponse.json({ assignment: toAssignmentView(updated) }, { status: 200 });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const gate = await requireMinimumRoleApi('manager');
  if (!gate.ok) return gate.response;
  const actor = gate.session;

  const { id } = await ctx.params;

  const existing = await getAssignmentById(id);
  if (!existing) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }
  if (!canAssignLeadWithinBranch(actor, { branch: existing.branch })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await unassignLead({ id, actorId: actor.id });
  return NextResponse.json({ success: true }, { status: 200 });
}
