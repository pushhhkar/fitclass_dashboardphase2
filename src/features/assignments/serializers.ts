/**
 * DB row → app-facing assignment view. Pure projection.
 */
import type { Assignment } from '@/src/types/database';

export interface AssignmentView {
  id: string;
  lead_id: string;
  branch: string;
  assigned_to: string;
  assigned_by: string;
  assigned_at: string;
  notes: string | null;
}

export function toAssignmentView(row: Assignment): AssignmentView {
  return {
    id: row.id,
    lead_id: row.lead_id,
    branch: row.branch,
    assigned_to: row.assigned_to,
    assigned_by: row.assigned_by,
    assigned_at: row.assigned_at,
    notes: row.notes,
  };
}

export function toAssignmentViews(rows: Assignment[]): AssignmentView[] {
  return rows.map(toAssignmentView);
}
