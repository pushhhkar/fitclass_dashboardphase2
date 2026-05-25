/**
 * Small chip showing a user's role. Pure presentation — safe in any runtime.
 *
 * Labels come from the canonical `ROLE_LABELS` in
 * `src/features/auth/constants` so renaming a role in one place updates
 * every badge in the app.
 */
import { ROLE_LABELS } from '@/src/features/auth/constants';
import type { UserRole } from '@/src/types/auth';

const ROLE_STYLES: Record<UserRole, string> = {
  admin:                  'bg-violet-50 text-violet-700 border-violet-200',
  manager:                'bg-blue-50 text-blue-700 border-blue-200',
  senior_sales_executive: 'bg-teal-50 text-teal-700 border-teal-200',
  sales_executive:        'bg-emerald-50 text-emerald-700 border-emerald-200',
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
