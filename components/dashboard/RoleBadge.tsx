/**
 * Small chip showing a user's role. Pure presentation — safe in any runtime.
 */
import type { UserRole } from '@/src/types/auth';

const ROLE_STYLES: Record<UserRole, string> = {
  admin:   'bg-violet-50 text-violet-700 border-violet-200',
  manager: 'bg-blue-50 text-blue-700 border-blue-200',
  sales:   'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin:   'Admin',
  manager: 'Manager',
  sales:   'Sales',
};

interface Props {
  role: UserRole;
  className?: string;
}

export function RoleBadge({ role, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ROLE_STYLES[role]} ${className}`.trim()}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
