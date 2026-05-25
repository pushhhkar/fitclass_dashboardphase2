'use client';

/**
 * Role <select> filtered to roles the ACTOR is allowed to assign.
 *
 * The dropdown options are derived from `canCreateUser(actor.role, target)`
 * — admins see all four roles, managers see only the sales tier. Anyone
 * else gets an empty list (the UI shouldn't have rendered the picker at
 * all for them; the server gate would also reject).
 *
 * SECURITY: this filter is UX only. The server re-applies the same
 * predicate in POST/PATCH /api/users — a crafted request with a forbidden
 * role is rejected with 403 regardless of what the dropdown offered.
 */
import { useMemo } from 'react';
import { ROLES, ROLE_LABELS } from '@/src/features/auth/constants';
import type { UserRole } from '@/src/types/auth';
import { canCreateUser } from '@/src/lib/permissions';

interface Props {
  id: string;
  value: UserRole;
  onChange: (role: UserRole) => void;
  /** The role of the user operating the picker. Drives option filtering. */
  actorRole: UserRole;
  disabled?: boolean;
  label?: string;
}

export default function RoleSelector({
  id,
  value,
  onChange,
  actorRole,
  disabled,
  label = 'Role',
}: Props) {
  // Memoize: ROLES is a 4-element tuple so the filter is cheap, but locking
  // the array IDENTITY to `actorRole` lets downstream memoized children
  // (here just the <option>s, but the pattern matters at scale) avoid the
  // re-render storm a fresh array reference would cause every render.
  const options = useMemo(
    () => ROLES.filter((r) => canCreateUser(actorRole, r)),
    [actorRole],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-[#0F172A]">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as UserRole)}
        disabled={disabled || options.length === 0}
        className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20 disabled:cursor-not-allowed disabled:bg-[#F8FAFC]"
      >
        {options.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </div>
  );
}
