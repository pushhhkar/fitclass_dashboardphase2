'use client';

/**
 * Admin → edit user. Sends PATCH /api/users/[id] with the diff. Privilege-
 * safety guards (last-admin, self-demotion, self-deactivation) are enforced
 * server-side; this UI hides the corresponding controls when applicable.
 *
 * "Set password" opens the ResetPasswordModal (admin only) where the admin
 * types the new password directly. The server bcrypt-hashes it, invalidates
 * the target's sessions, and flags them to change it on next login.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser, UserRole } from '@/src/types/auth';
import Modal from './Modal';
import RoleSelector from './RoleSelector';
import BranchMultiSelect from './BranchMultiSelect';
import ResetPasswordModal from './ResetPasswordModal';

interface Props {
  open: boolean;
  onClose: () => void;
  user: SessionUser;
  /** id of the actor performing the edit; disables self-lockout controls. */
  currentUserId: string;
  /** role of the actor; drives the role-dropdown filter. */
  actorRole: UserRole;
}

export default function EditUserModal({
  open,
  onClose,
  user,
  currentUserId,
  actorRole,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(user.name ?? '');
  const [role, setRole] = useState<UserRole>(user.role);
  const [allowedBranches, setAllowedBranches] = useState<string[]>(user.allowed_branches);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    setName(user.name ?? '');
    setRole(user.role);
    setAllowedBranches(user.allowed_branches);
  }, [user]);

  const isSelf = user.id === currentUserId;
  // Manual password-setting is admin-only (spec) and never on yourself —
  // admins rotate their own password through the self-service change flow.
  const canSetPassword = actorRole === 'admin' && !isSelf;

  const handleClose = () => {
    if (pending) return;
    setError(null);
    onClose();
    router.refresh();
  };

  const submitPatch = async (patch: Record<string, unknown>) => {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        setError(data?.error ?? 'Failed to update user.');
        return false;
      }
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      return false;
    } finally {
      setPending(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (name !== (user.name ?? '')) patch.name = name;
    if (role !== user.role) patch.role = role;
    if (
      JSON.stringify([...allowedBranches].sort()) !==
      JSON.stringify([...user.allowed_branches].sort())
    ) {
      patch.allowed_branches = allowedBranches;
    }
    if (Object.keys(patch).length === 0) {
      handleClose();
      return;
    }
    const ok = await submitPatch(patch);
    if (ok) handleClose();
  };

  const handleToggleActive = async () => {
    const ok = await submitPatch({ is_active: !user.is_active });
    if (ok) handleClose();
  };

  const locked = pending;

  return (
   <>
    <Modal open={open} onClose={handleClose} title={`Edit ${user.email}`} locked={locked}>
      <form onSubmit={handleSave} className="flex flex-col gap-4" noValidate>
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-name" className="text-xs font-semibold text-[#0F172A]">Name</label>
          <input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={locked}
            className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20 disabled:cursor-not-allowed disabled:bg-[#F8FAFC]"
          />
        </div>

        <RoleSelector
          id="edit-role"
          value={role}
          onChange={setRole}
          actorRole={actorRole}
          disabled={locked || isSelf}
        />
        {isSelf && (
          <p className="-mt-2 text-[11px] text-[#64748B]">
            You can't change your own role (server enforces this too).
          </p>
        )}

        <BranchMultiSelect
          id="edit-branches"
          value={allowedBranches}
          onChange={setAllowedBranches}
          disabled={locked}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex gap-2">
            {canSetPassword && (
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                disabled={locked}
                className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Set password
              </button>
            )}
            {!isSelf && (
              user.is_active ? (
                <button
                  type="button"
                  onClick={handleToggleActive}
                  disabled={locked}
                  className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Deactivate
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleToggleActive}
                  disabled={locked}
                  className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reactivate
                </button>
              )
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={locked}
              className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={locked}
              aria-busy={pending}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0b6cbf] px-3 py-2 text-xs font-semibold text-white hover:bg-[#095699] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending && (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              )}
              Save changes
            </button>
          </div>
        </div>
      </form>
    </Modal>

    {canSetPassword && (
      <ResetPasswordModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        userId={user.id}
        email={user.email}
      />
    )}
   </>
  );
}
