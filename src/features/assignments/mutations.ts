/**
 * Assignment WRITE layer. SERVER-ONLY.
 *
 * Each helper performs the DB mutation AND emits the matching audit row
 * (via never-throw helpers from src/features/activities). Audit writes
 * cannot fail the business operation.
 *
 * One row per lead is enforced by a DB-level UNIQUE INDEX on lead_id
 * (see migration 20260521000000). A duplicate insert surfaces as a
 * DatabaseError with kind='unique_violation' which the API layer turns
 * into a 409 — callers in this module don't handle it; routes do.
 */
import { supabaseAdmin } from '@/src/lib/db/supabase';
import { fromPostgrestError, notFound } from '@/src/lib/db/errors';
import type {
  Assignment,
  AssignmentInsert,
  AssignmentUpdate,
} from '@/src/types/database';
import {
  logAssignmentCreated,
  logAssignmentReassigned,
  logAssignmentRemoved,
} from '@/src/features/activities/mutations';

const ASSIGNMENTS_TABLE = 'assignments';

function asAssignment(row: unknown): Assignment {
  return row as Assignment;
}

interface AssignLeadInput {
  leadId: string;
  branch: string;
  assignedTo: string;
  assignedBy: string;
  notes?: string | null;
}

/**
 * Create a NEW assignment for a lead that has none. If the lead already has
 * an owner, the DB unique index throws (caller surfaces 409 + suggests
 * `reassignLead` instead).
 */
export async function assignLead(input: AssignLeadInput): Promise<Assignment> {
  const payload: AssignmentInsert = {
    lead_id: input.leadId,
    branch: input.branch,
    assigned_to: input.assignedTo,
    assigned_by: input.assignedBy,
    notes: input.notes ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw fromPostgrestError(error);
  const row = asAssignment(data);

  await logAssignmentCreated(input.assignedBy, input.leadId, {
    assignment_id: row.id,
    branch: row.branch,
    assigned_to: row.assigned_to,
    notes: row.notes,
  });

  return row;
}

interface ReassignInput {
  /** Existing assignment row id. */
  id: string;
  /** New owner. */
  assignedTo: string;
  /** Actor performing the reassignment (for audit + assigned_by stamp). */
  actorId: string;
  notes?: string | null;
}

/**
 * Reassign an existing assignment. Performs the update in-place (keeps the
 * same `id`) so other tables / future references stay stable. The previous
 * owner is captured in the audit row's `old_value`.
 */
export async function reassignLead(input: ReassignInput): Promise<Assignment> {
  // Read the current row so we can record a clean before/after snapshot.
  const { data: existingRow, error: readErr } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select('*')
    .eq('id', input.id)
    .maybeSingle();
  if (readErr) throw fromPostgrestError(readErr);
  if (!existingRow) throw notFound('Assignment');
  const before = asAssignment(existingRow);

  const patch: AssignmentUpdate = {
    assigned_to: input.assignedTo,
    assigned_by: input.actorId,
    notes: input.notes ?? before.notes,
  };

  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single();

  if (error) throw fromPostgrestError(error);
  const after = asAssignment(data);

  await logAssignmentReassigned(
    input.actorId,
    after.lead_id,
    {
      assignment_id: before.id,
      assigned_to: before.assigned_to,
      assigned_by: before.assigned_by,
    },
    {
      assignment_id: after.id,
      assigned_to: after.assigned_to,
      assigned_by: after.assigned_by,
    },
  );

  return after;
}

interface UnassignInput {
  id: string;
  actorId: string;
}

/**
 * Delete the assignment row entirely. Lead returns to "unowned". Audit row
 * captures who/what was removed so admins can reconstruct ownership history.
 */
export async function unassignLead(input: UnassignInput): Promise<void> {
  const { data: existingRow, error: readErr } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select('*')
    .eq('id', input.id)
    .maybeSingle();
  if (readErr) throw fromPostgrestError(readErr);
  if (!existingRow) throw notFound('Assignment');
  const before = asAssignment(existingRow);

  const { error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .delete()
    .eq('id', input.id);
  if (error) throw fromPostgrestError(error);

  await logAssignmentRemoved(input.actorId, before.lead_id, {
    assignment_id: before.id,
    branch: before.branch,
    assigned_to: before.assigned_to,
    notes: before.notes,
  });
}
