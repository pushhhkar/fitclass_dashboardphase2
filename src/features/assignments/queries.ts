/**
 * Assignment READ layer. SERVER-ONLY (supabaseAdmin, RLS-bypass).
 *
 * Phase 2U: every SELECT embeds the assignee user via the PostgREST
 * `users!assigned_to(name, email)` syntax — ONE SQL join, no N+1, and
 * the UI never has to fall back to displaying the raw `assigned_to`
 * UUID when an assignee isn't in the caller's candidate list.
 *
 * The batch variant `getAssignmentsByLeadIds` is the workhorse: the leads
 * route fetches rows from Google Sheets, then asks this module for the
 * matching assignments + their assignees in ONE round-trip.
 */
import { supabaseAdmin } from '@/src/lib/db/supabase';
import { fromPostgrestError } from '@/src/lib/db/errors';
import type { Assignment } from '@/src/types/database';
import type { AssignmentRowWithAssignee } from './serializers';

const ASSIGNMENTS_TABLE = 'assignments';

// PostgREST embed expression. Reads as: "select all assignment columns,
// plus a nested object called `assignee` populated from the users table
// via the foreign-key column `assigned_to`, projecting only `name` and
// `email`." Supabase resolves the FK by column-name reference.
const SELECT_WITH_ASSIGNEE = '*, assignee:users!assigned_to(name, email)';

function asJoined(row: unknown): AssignmentRowWithAssignee {
  return row as AssignmentRowWithAssignee;
}
function asJoinedMany(rows: unknown): AssignmentRowWithAssignee[] {
  return (rows as AssignmentRowWithAssignee[] | null) ?? [];
}

/** Single assignment by lead. Null when the lead has no current owner. */
export async function getLeadAssignment(
  leadId: string,
): Promise<AssignmentRowWithAssignee | null> {
  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select(SELECT_WITH_ASSIGNEE)
    .eq('lead_id', leadId)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  return data ? asJoined(data) : null;
}

/** Single assignment by primary key. */
export async function getAssignmentById(
  id: string,
): Promise<AssignmentRowWithAssignee | null> {
  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select(SELECT_WITH_ASSIGNEE)
    .eq('id', id)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  return data ? asJoined(data) : null;
}

/**
 * Batch fetch with embedded assignee. Returns a Map<lead_id, row>.
 * `lead_ids` length is capped on the caller side; Supabase's `.in()`
 * accepts sensible sizes — a typical branch sheet (< 5k rows) is fine.
 */
export async function getAssignmentsByLeadIds(
  leadIds: readonly string[],
): Promise<Map<string, AssignmentRowWithAssignee>> {
  if (leadIds.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select(SELECT_WITH_ASSIGNEE)
    .in('lead_id', leadIds);

  if (error) throw fromPostgrestError(error);
  const rows = asJoinedMany(data);
  const map = new Map<string, AssignmentRowWithAssignee>();
  for (const row of rows) map.set(row.lead_id, row);
  return map;
}

/** All assignments currently owned by a given user (newest first). */
export async function getAssignmentsForUser(
  userId: string,
): Promise<AssignmentRowWithAssignee[]> {
  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select(SELECT_WITH_ASSIGNEE)
    .eq('assigned_to', userId)
    .order('assigned_at', { ascending: false });

  if (error) throw fromPostgrestError(error);
  return asJoinedMany(data);
}

/**
 * Distinct branches in which a user holds at least one assignment.
 *
 * Powers the sales_executive branch-tab list — for SEs, "branches they can
 * see" is derived from actual ownership, NOT from `users.allowed_branches`.
 * Single-column projection; no JOIN needed here.
 */
export async function getDistinctBranchesForUser(
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select('branch')
    .eq('assigned_to', userId);
  if (error) throw fromPostgrestError(error);
  const rows = (data as { branch: string }[] | null) ?? [];
  const set = new Set<string>();
  for (const row of rows) set.add(row.branch);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** All assignments inside a branch (manager scope). */
export async function getAssignmentsForBranch(
  branch: string,
): Promise<AssignmentRowWithAssignee[]> {
  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select(SELECT_WITH_ASSIGNEE)
    .eq('branch', branch)
    .order('assigned_at', { ascending: false });

  if (error) throw fromPostgrestError(error);
  return asJoinedMany(data);
}

/** All assignments across a set of branches (manager with multiple scopes). */
export async function getAssignmentsForBranches(
  branches: readonly string[],
): Promise<AssignmentRowWithAssignee[]> {
  if (branches.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select(SELECT_WITH_ASSIGNEE)
    .in('branch', branches)
    .order('assigned_at', { ascending: false });

  if (error) throw fromPostgrestError(error);
  return asJoinedMany(data);
}

/** All assignments — admin scope only; never call from a manager surface. */
export async function listAllAssignments(): Promise<AssignmentRowWithAssignee[]> {
  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select(SELECT_WITH_ASSIGNEE)
    .order('assigned_at', { ascending: false });

  if (error) throw fromPostgrestError(error);
  return asJoinedMany(data);
}

// `Assignment` re-exported for callers that need the bare DB shape (none
// in current code, but kept available in case a future caller wants the
// un-joined record).
export type { Assignment };
