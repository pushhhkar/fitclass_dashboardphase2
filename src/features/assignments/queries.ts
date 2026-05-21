/**
 * Assignment READ layer. SERVER-ONLY (supabaseAdmin, RLS-bypass).
 *
 * The batch variant `getAssignmentsByLeadIds` is the workhorse: the leads
 * route fetches the rows from Google Sheets, then asks this module for the
 * matching assignments in ONE query and joins them in memory. No N+1.
 */
import { supabaseAdmin } from '@/src/lib/db/supabase';
import { fromPostgrestError } from '@/src/lib/db/errors';
import type { Assignment } from '@/src/types/database';

const ASSIGNMENTS_TABLE = 'assignments';

function asAssignment(row: unknown): Assignment {
  return row as Assignment;
}
function asAssignments(rows: unknown): Assignment[] {
  return (rows as Assignment[] | null) ?? [];
}

/** Single assignment by lead. Null when the lead has no current owner. */
export async function getLeadAssignment(
  leadId: string,
): Promise<Assignment | null> {
  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  return data ? asAssignment(data) : null;
}

/** Single assignment by primary key. */
export async function getAssignmentById(
  id: string,
): Promise<Assignment | null> {
  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  return data ? asAssignment(data) : null;
}

/**
 * Batch fetch. Returns a Map<lead_id, Assignment> for fast lookup when
 * enriching a Sheets-derived list of leads.
 *
 * `lead_ids` length is capped on the caller side; Supabase's `.in()` accepts
 * sensible array sizes but extremely large arrays should be chunked. For a
 * typical branch sheet (< 5k rows) one query is fine.
 */
export async function getAssignmentsByLeadIds(
  leadIds: readonly string[],
): Promise<Map<string, Assignment>> {
  if (leadIds.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select('*')
    .in('lead_id', leadIds);

  if (error) throw fromPostgrestError(error);
  const rows = asAssignments(data);
  const map = new Map<string, Assignment>();
  for (const row of rows) map.set(row.lead_id, row);
  return map;
}

/** All assignments currently owned by a given user (newest first). */
export async function getAssignmentsForUser(
  userId: string,
): Promise<Assignment[]> {
  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select('*')
    .eq('assigned_to', userId)
    .order('assigned_at', { ascending: false });

  if (error) throw fromPostgrestError(error);
  return asAssignments(data);
}

/** All assignments inside a branch (manager scope). */
export async function getAssignmentsForBranch(
  branch: string,
): Promise<Assignment[]> {
  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select('*')
    .eq('branch', branch)
    .order('assigned_at', { ascending: false });

  if (error) throw fromPostgrestError(error);
  return asAssignments(data);
}

/** All assignments across a set of branches (manager with multiple scopes). */
export async function getAssignmentsForBranches(
  branches: readonly string[],
): Promise<Assignment[]> {
  if (branches.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select('*')
    .in('branch', branches)
    .order('assigned_at', { ascending: false });

  if (error) throw fromPostgrestError(error);
  return asAssignments(data);
}

/** All assignments — admin scope only; never call from a manager surface. */
export async function listAllAssignments(): Promise<Assignment[]> {
  const { data, error } = await supabaseAdmin
    .from(ASSIGNMENTS_TABLE)
    .select('*')
    .order('assigned_at', { ascending: false });

  if (error) throw fromPostgrestError(error);
  return asAssignments(data);
}
