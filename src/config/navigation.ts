/**
 * Dashboard navigation — Phase 2G structure.
 *
 *  Admin   → Leads · Assignments · Users · Analytics
 *  Manager → Leads · Assignments · Team
 *  Sales   → Leads · My Leads
 *
 * `Leads` is the unified, role-filtered entry point. The legacy `/`
 * dashboard is gone; this is the only lead surface now. Visibility here is
 * UX ONLY — every destination listed must enforce its own access on the
 * server. A user typing the URL directly hits the same gate they would
 * have hit from the nav.
 */
import type { UserRole } from '@/src/types/auth';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  /** Explicit allow-list of roles that may SEE this item. */
  roles: readonly UserRole[];
}

export const DASHBOARD_NAV: readonly NavItem[] = [
  { id: 'leads',       label: 'Leads',       href: '/dashboard/leads',       roles: ['admin', 'manager', 'sales'] },
  { id: 'assignments', label: 'Assignments', href: '/dashboard/assignments', roles: ['admin', 'manager'] },
  { id: 'users',       label: 'Users',       href: '/dashboard/users',       roles: ['admin'] },
  { id: 'analytics',   label: 'Analytics',   href: '/dashboard/analytics',   roles: ['admin'] },
  { id: 'team',        label: 'Team',        href: '/dashboard/team',        roles: ['manager'] },
  { id: 'my-leads',    label: 'My Leads',    href: '/dashboard/my-leads',    roles: ['sales'] },
] as const;

export function navItemsForRole(role: UserRole): NavItem[] {
  return DASHBOARD_NAV.filter((item) => item.roles.includes(role));
}
