/**
 * Shared lead card-filter logic.
 *
 * Single source of truth for how the dashboard's stat-card filter
 * (all / new / callAttempted / …) maps to lead Status values. Used by BOTH
 * the AG Grid render path (LeadsTable) AND the export path (so the downloaded
 * file matches exactly what the active filter shows on screen).
 */
import type { Lead } from '@/types';
import type { CardFilter } from '@/components/dashboard/LeadDashboardShell';

export const FILTER_STATUSES: Record<CardFilter, string[] | null> = {
  all:            null,
  new:            ['New'],
  callAttempted:  ['Call Attempted', 'Not Answering', 'Call Back Later'],
  unqualified:    ['Budget Issue', 'Wrong Branch', 'Location Issue', 'Not Interested', 'Job Applicant'],
  visitScheduled: ['Visit Scheduled'],
  converted:      ['Membership Purchased'],
};

/** Apply the active card-filter to a lead list. `all` returns the list as-is. */
export function applyLeadFilter(leads: readonly Lead[], filter: CardFilter): Lead[] {
  const allowed = FILTER_STATUSES[filter];
  if (!allowed) return [...leads];
  const set = new Set(allowed);
  return leads.filter((l) => set.has(l.Status ?? ''));
}
