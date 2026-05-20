/**
 * Assignment-based lead permissions.
 *
 * Composes role + branch scope + ownership. Foundation only — Phase 2E does
 * NOT wire these into the legacy CRM data routes. The matrix is:
 *
 *                 view                       modify                     assign
 *   admin         all                        all                        all
 *   manager       in-branch                  in-branch                  in-branch
 *   sales         in-branch AND owner        in-branch AND owner        ✗
 *
 * "owner" means `assignment.assigned_to === user.id`. Unassigned leads are
 * visible/modifiable by admin and by managers in the branch — sales sees
 * only what is explicitly theirs.
 *
 * `LeadContext` is intentionally minimal — pass whatever you have. The
 * Sheets engine doesn't know about assignments today; once /api/leads joins
 * the assignments table (Phase 2E+), populate `assignedToUserId` from there.
 */
import type { SessionUser } from '@/src/types/auth';
import { canAccessLeadBranch } from './branches';

export interface LeadContext {
  /** Sheet tab name (= branch identifier). */
  branch: string;
  /** users.id of the current assignee, or null when unassigned. */
  assignedToUserId?: string | null;
}

function isOwner(user: SessionUser, lead: LeadContext): boolean {
  return !!lead.assignedToUserId && lead.assignedToUserId === user.id;
}

export function canViewLead(
  user: SessionUser | null | undefined,
  lead: LeadContext,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!canAccessLeadBranch(user, lead.branch)) return false;
  if (user.role === 'manager') return true;
  // sales
  return isOwner(user, lead);
}

export function canModifyLead(
  user: SessionUser | null | undefined,
  lead: LeadContext,
): boolean {
  // Same surface area as view today; split kept so future rules (e.g. a
  // "read-only" role) only change one helper.
  return canViewLead(user, lead);
}

export function canAssignLead(
  user: SessionUser | null | undefined,
  lead: LeadContext,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'manager') return false;
  return canAccessLeadBranch(user, lead.branch);
}
