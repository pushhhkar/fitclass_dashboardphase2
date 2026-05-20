/**
 * Row → public-shape translation for activities. Pure projection — never
 * exposes columns we want to keep server-internal.
 */
import type { Activity } from '@/src/types/database';
import type { ActivityView } from './types';

export function toActivityView(row: Activity): ActivityView {
  return {
    id: row.id,
    action_type: row.action_type,
    performed_by: row.performed_by,
    subject_user_id: row.subject_user_id,
    lead_id: row.lead_id,
    old_value: row.old_value,
    new_value: row.new_value,
    created_at: row.created_at,
  };
}

export function toActivityViews(rows: Activity[]): ActivityView[] {
  return rows.map(toActivityView);
}
