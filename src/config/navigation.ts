/**
 * Dashboard navigation — the single source of truth for which links exist,
 * where they go, and who can see them.
 *
 * Visibility here is UX ONLY. Every destination listed must enforce its own
 * access on the server (see src/lib/permissions/server.ts) — a user typing
 * the URL directly must hit the same gate they would have hit from the nav.
 *
 * Adding a route: append an entry below. Filtering by role is automatic via
 * `navItemsForRole`. Page-level server guards live with the page.
 */
import type { UserRole } from '@/src/types/auth';

export interface NavItem {
  /** Stable id for React keys + telemetry. */
  id: string;
  label: string;
  href: string;
  /** Explicit allow-list of roles that may SEE this item. */
  roles: readonly UserRole[];
}

export const DASHBOARD_NAV: readonly NavItem[] = [
  { id: 'dashboard',   label: 'Dashboard',   href: '/dashboard',             roles: ['admin', 'manager', 'sales'] },
  { id: 'users',       label: 'Users',       href: '/dashboard/users',       roles: ['admin'] },
  { id: 'analytics',   label: 'Analytics',   href: '/dashboard/analytics',   roles: ['admin'] },
  { id: 'assignments', label: 'Assignments', href: '/dashboard/assignments', roles: ['admin', 'manager'] },
  { id: 'team',        label: 'Team',        href: '/dashboard/team',        roles: ['manager'] },
  { id: 'my-leads',    label: 'My Leads',    href: '/dashboard/my-leads',    roles: ['sales'] },
] as const;

export function navItemsForRole(role: UserRole): NavItem[] {
  return DASHBOARD_NAV.filter((item) => item.roles.includes(role));
}
