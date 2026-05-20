/**
 * Audit-log reads.
 *
 * SERVER-ONLY. Reads via `supabaseAdmin` since the table is RLS deny-by-
 * default. Callers must enforce role (admin) above this layer — this module
 * doesn't gate.
 */
import { supabaseAdmin } from '@/src/lib/db/supabase';
import { fromPostgrestError } from '@/src/lib/db/errors';
import type { Activity } from '@/src/types/database';

const ACTIVITIES_TABLE = 'activities';

function asActivities(rows: unknown): Activity[] {
  return (rows as Activity[] | null) ?? [];
}

/** Most-recent activities first. Defaults to a small page. */
export async function listRecentActivities(limit = 50): Promise<Activity[]> {
  const { data, error } = await supabaseAdmin
    .from(ACTIVITIES_TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw fromPostgrestError(error);
  return asActivities(data);
}

export async function listActivitiesForUser(
  subjectUserId: string,
  limit = 50,
): Promise<Activity[]> {
  const { data, error } = await supabaseAdmin
    .from(ACTIVITIES_TABLE)
    .select('*')
    .eq('subject_user_id', subjectUserId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw fromPostgrestError(error);
  return asActivities(data);
}

export async function listActivitiesForLead(
  leadId: string,
  limit = 50,
): Promise<Activity[]> {
  const { data, error } = await supabaseAdmin
    .from(ACTIVITIES_TABLE)
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw fromPostgrestError(error);
  return asActivities(data);
}
