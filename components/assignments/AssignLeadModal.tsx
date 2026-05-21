'use client';

/**
 * Single modal that handles both CREATE (when no existing assignment) and
 * REASSIGN/UNASSIGN (when one is provided).
 *
 * - On create:    POST   /api/assignments        with { lead_id, branch, assigned_to, notes }
 * - On reassign:  PATCH  /api/assignments/[id]   with { assigned_to, notes }
 * - On unassign:  DELETE /api/assignments/[id]
 *
 * Closing the modal calls router.refresh() so the server-rendered list above
 * reflects the new state.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/src/types/auth';
import type { AssignmentView } from '@/src/features/assignments/serializers';
import Modal from '@/components/users/Modal';
import AssignmentSelector from './AssignmentSelector';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Currently authenticated actor (drives self-* hints). */
  actor: SessionUser;
  /** Pickable users (active accounts visible to the actor). */
  candidates: SessionUser[];
  /** Existing assignment, if reassigning/unassigning. */
  existing?: AssignmentView | null;
  /** Lead identity — required when creating a new assignment. */
  defaultLeadId?: string;
  defaultBranch?: string;
}

export default function AssignLeadModal({
  open,
  onClose,
  actor,
  candidates,
  existing,
  defaultLeadId,
  defaultBranch,
}: Props) {
  const router = useRouter();
  const [leadId, setLeadId] = useState(existing?.lead_id ?? defaultLeadId ?? '');
  const [branch, setBranch] = useState(existing?.branch ?? defaultBranch ?? '');
  const [assignedTo, setAssignedTo] = useState(existing?.assigned_to ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-hydrate when the modal is reopened against a different row.
  useEffect(() => {
    if (!open) return;
    setLeadId(existing?.lead_id ?? defaultLeadId ?? '');
    setBranch(existing?.branch ?? defaultBranch ?? '');
    setAssignedTo(existing?.assigned_to ?? '');
    setNotes(existing?.notes ?? '');
    setError(null);
  }, [open, existing, defaultLeadId, defaultBranch]);

  const close = () => {
    if (pending) return;
    onClose();
    router.refresh();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!assignedTo) {
      setError('Pick an assignee.');
      return;
    }
    setPending(true);
    try {
      const res = existing
        ? await fetch(`/api/assignments/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assigned_to: assignedTo, notes: notes || null }),
          })
        : await fetch('/api/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lead_id: leadId,
              branch,
              assigned_to: assignedTo,
              notes: notes || null,
            }),
          });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Failed to save assignment.');
        return;
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setPending(false);
    }
  };

  const unassign = async () => {
    if (!existing || pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/assignments/${existing.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Failed to unassign.');
        return;
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setPending(false);
    }
  };

  const isEdit = !!existing;

  return (
    <Modal
      open={open}
      onClose={close}
      title={isEdit ? 'Reassign lead' : 'Assign lead'}
      locked={pending}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <Field
          id="assign-lead-id"
          label="Lead identifier"
          value={leadId}
          onChange={setLeadId}
          disabled={pending || isEdit}
          helper="Format: dashboardId::sheetName::rowIndex"
        />
        <Field
          id="assign-branch"
          label="Branch (sheet tab)"
          value={branch}
          onChange={setBranch}
          disabled={pending || isEdit}
        />

        <AssignmentSelector
          id="assign-user"
          value={assignedTo}
          onChange={setAssignedTo}
          users={candidates}
          disabled={pending}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="assign-notes" className="text-xs font-semibold text-[#0F172A]">
            Notes <span className="font-normal text-[#94A3B8]">(optional)</span>
          </label>
          <textarea
            id="assign-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={pending}
            rows={3}
            className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20 disabled:cursor-not-allowed disabled:bg-[#F8FAFC]"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {isEdit ? (
            <button
              type="button"
              onClick={unassign}
              disabled={pending}
              className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Unassign
            </button>
          ) : (
            <span className="text-[11px] text-[#64748B]">
              Acting as {actor.email}
            </span>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0b6cbf] px-3 py-2 text-xs font-semibold text-white hover:bg-[#095699] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending && (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              )}
              {isEdit ? 'Save changes' : 'Assign'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  helper?: string;
}

function Field({ id, label, value, onChange, disabled, helper }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-[#0F172A]">{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20 disabled:cursor-not-allowed disabled:bg-[#F8FAFC]"
      />
      {helper && <p className="text-[11px] text-[#94A3B8]">{helper}</p>}
    </div>
  );
}
