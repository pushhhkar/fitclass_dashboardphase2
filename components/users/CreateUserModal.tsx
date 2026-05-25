'use client';

/**
 * Admin → create user. Posts to /api/users; the server generates the
 * temporary password and returns it once for out-of-band sharing.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@/src/types/auth';
import { ROLES } from '@/src/features/auth/constants';
import { canCreateUser } from '@/src/lib/permissions';
import Modal from './Modal';
import RoleSelector from './RoleSelector';
import BranchMultiSelect from './BranchMultiSelect';
import TemporaryPasswordPanel from './TemporaryPasswordPanel';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Role of the actor (drives the default + filtered role options). */
  actorRole: UserRole;
}

interface CreateSuccess {
  email: string;
  temporaryPassword: string;
}

/**
 * Compute the default new-user role from the actor's authority.
 * Under Phase 2M strict-one-level-down, every role has exactly one creatable
 * target so the "default" is always the single allowed option:
 *   admin → manager
 *   manager → senior_sales_executive
 *   senior_sales_executive → sales_executive
 *   sales_executive → null  (modal shouldn't be reachable for SE)
 *
 * Previously this was hard-coded to 'sales_executive', which left the form
 * with an invalid initial state for managers (the server then 403'd a submit
 * the user hadn't visibly mis-configured).
 */
function defaultCreatableRole(actorRole: UserRole): UserRole | null {
  for (const r of ROLES) {
    if (canCreateUser(actorRole, r)) return r;
  }
  return null;
}

export default function CreateUserModal({ open, onClose, actorRole }: Props) {
  const router = useRouter();
  // Memoize: actor-role doesn't change at runtime; this is essentially a const
  // per mount but useMemo documents the dependency.
  const initialRole = useMemo(
    () => defaultCreatableRole(actorRole) ?? 'sales_executive',
    [actorRole],
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>(initialRole);
  const [allowedBranches, setAllowedBranches] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateSuccess | null>(null);

  const reset = () => {
    setName('');
    setEmail('');
    setRole(initialRole);
    setAllowedBranches([]);
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    if (pending) return;
    reset();
    onClose();
    if (success) router.refresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, allowed_branches: allowedBranches }),
      });
      const data = (await res.json().catch(() => null)) as
        | { user?: { email: string }; temporaryPassword?: string; error?: string }
        | null;
      if (!res.ok) {
        setError(data?.error ?? 'Failed to create user.');
        return;
      }
      if (!data?.temporaryPassword || !data.user?.email) {
        setError('Unexpected response from server.');
        return;
      }
      setSuccess({ email: data.user.email, temporaryPassword: data.temporaryPassword });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={success ? 'User created' : 'New user'} locked={pending}>
      {success ? (
        <div className="space-y-4">
          <p className="text-sm text-[#0F172A]">
            <span className="font-semibold">{success.email}</span> can now sign in.
          </p>
          <TemporaryPasswordPanel password={success.temporaryPassword} email={success.email} />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl bg-[#0b6cbf] px-4 py-2 text-sm font-semibold text-white hover:bg-[#095699]"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <Field
            id="new-user-name"
            label="Name"
            value={name}
            onChange={setName}
            disabled={pending}
            required
            autoComplete="name"
          />
          <Field
            id="new-user-email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            disabled={pending}
            required
            autoComplete="off"
          />
          <RoleSelector
            id="new-user-role"
            value={role}
            onChange={setRole}
            actorRole={actorRole}
            disabled={pending}
          />
          <BranchMultiSelect
            id="new-user-branches"
            value={allowedBranches}
            onChange={setAllowedBranches}
            disabled={pending}
          />

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={pending}
              className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0b6cbf] px-4 py-2 text-sm font-semibold text-white hover:bg-[#095699] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending && (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              )}
              {pending ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'email';
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
}

function Field({ id, label, value, onChange, type = 'text', disabled, required, autoComplete }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-[#0F172A]">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20 disabled:cursor-not-allowed disabled:bg-[#F8FAFC]"
      />
    </div>
  );
}
