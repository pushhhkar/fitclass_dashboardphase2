/**
 * Dashboard navigation (Phase 2W).
 *
 *  Admin   → Leads · Assignments · Users · Analytics
 *  Manager → Leads · Assignments · Users · Team
 *  SSE     → Leads · Assignments · Users · My Leads
 *  SE      → Leads · My Leads
 *
 * Role responsibilities:
 *  - Admin   → creates any role (incl admin); oversight on lead assignments
 *  - Manager → creates any non-admin; routes leads to SSE/SE in their branches
 *  - SSE     → cannot create users (view-only); routes leads to SE in branch
 *  - SE      → operational only; no creation, no assignment, read-only chip
 *
 *  Visibility here is UX ONLY — every destination listed enforces its own
 *  access on the server.
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
  { id: 'leads',       label: 'Leads',       href: '/dashboard/leads',       roles: ['admin', 'manager', 'senior_sales_executive', 'sales_executive'] },
  { id: 'assignments', label: 'Assignments', href: '/dashboard/assignments', roles: ['admin', 'manager', 'senior_sales_executive'] },
  { id: 'users',       label: 'Users',       href: '/dashboard/users',       roles: ['admin', 'manager', 'senior_sales_executive'] },
  { id: 'analytics',   label: 'Analytics',   href: '/dashboard/analytics',   roles: ['admin'] },
  { id: 'team',        label: 'Team',        href: '/dashboard/team',        roles: ['manager'] },
  { id: 'my-leads',    label: 'My Leads',    href: '/dashboard/my-leads',    roles: ['senior_sales_executive', 'sales_executive'] },
] as const;

export function navItemsForRole(role: UserRole): NavItem[] {
  return DASHBOARD_NAV.filter((item) => item.roles.includes(role));
}
