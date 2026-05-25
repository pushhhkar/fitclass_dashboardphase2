/**
 * Dashboard navigation.
 *
 *  Admin                  → Leads · Users · Analytics · Assignments
 *  Manager                → Leads · Users · Team
 *  Senior Sales Executive → Leads · Assignments · Users · My Leads
 *  Sales Executive        → Leads · My Leads
 *
 * Role responsibilities:
 *  - Admin   → creates any non-admin role; oversight on lead assignments
 *  - Manager → creates SSEs only; team management
 *  - SSE     → creates SEs; assigns individual leads to SEs
 *  - SE      → operational only; no creation, no assignment, read-only chip
 *
 *  Visibility here is UX ONLY — every destination listed enforces its own
 *  access on the server. The `Sheets` surface was retired; branch scopes
 *  are now managed directly on the user via Users → Edit (the underlying
 *  `users.allowed_branches` column is the runtime source of truth).
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
  { id: 'assignments', label: 'Assignments', href: '/dashboard/assignments', roles: ['admin', 'senior_sales_executive'] },
  { id: 'users',       label: 'Users',       href: '/dashboard/users',       roles: ['admin', 'manager', 'senior_sales_executive'] },
  { id: 'analytics',   label: 'Analytics',   href: '/dashboard/analytics',   roles: ['admin'] },
  { id: 'team',        label: 'Team',        href: '/dashboard/team',        roles: ['manager'] },
  { id: 'my-leads',    label: 'My Leads',    href: '/dashboard/my-leads',    roles: ['senior_sales_executive', 'sales_executive'] },
] as const;

export function navItemsForRole(role: UserRole): NavItem[] {
  return DASHBOARD_NAV.filter((item) => item.roles.includes(role));
}
