'use client';

/**
 * Inline lead-assignment picker for the leads-dashboard table.
 *
 * ── Authorization summary ─────────────────────────────────────────────────
 *  admin                  → can assign sales_executive only (oversight)
 *  manager                → no inline picker (managers don't route leads)
 *  senior_sales_executive → primary inline assigner; sales_executive only
 *  sales_executive        → read-only badge / "Unassigned" (no UI)
 *
 * ── Phase 2N performance ───────────────────────────────────────────────────
 *  Candidates are a PROP, not a fetch. `LeadDashboardShell` owns the cache
 *  — one HTTP request per (branch, actor), shared across every row's
 *  selector. Previously each row fetched independently on first open,
 *  causing duplicate requests as the user opened popovers across rows.
 *
 * ── Why backend enforcement remains mandatory ──────────────────────────────
 *  The shell-side fetch is filtered server-side via `canAssignToUser` +
 *  `canAssignLeadToBranch`. The picker THEN posts to /api/assignments,
 *  which re-runs the SAME predicates — DevTools / curl cannot widen
 *  authority, only what the server already approved.
 *
 * The popover renders into a portal at document.body so the AG Grid cell's
 * `overflow:hidden` doesn't clip it. Position is computed from the trigger
 * button's bounding rect once on each open.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SessionUser } from '@/src/types/auth';
import type { AssignmentView } from '@/src/features/assignments/serializers';
import { ROLE_LABELS } from '@/src/features/auth/constants';

interface Props {
  /** Sheet/tab name = branch identifier for the lead being assigned. */
  branch: string;
  /** Canonical lead id (makeLeadId(dashboardId, sheetName, rowIndex)). */
  leadId: string;
  /** Current assignment for this lead, if any. */
  existing: AssignmentView | null;
  /** The currently authenticated actor. Drives "can I assign at all?" UX. */
  actor: SessionUser;
  /**
   * Pre-filtered candidate users for this branch. Owned by the parent
   * (shell-level cache) — one fetch per branch, shared across rows.
   * Empty array is valid and just means "nobody assignable here yet".
   */
  candidates: SessionUser[];
  /**
   * Called after a successful create / reassign / unassign. Caller should
   * refresh the leads/assignments map so the row's badge updates.
   */
  onChanged: () => void;
  /**
   * Optional override for the candidates' display labels — when present we
   * show a friendly fallback if the assignment refers to a user no longer
   * in the candidate list (e.g. a manager-owned lead viewed by an SSE).
   */
  assigneeLabel?: string | null;
}

type PopoverRect = { top: number; left: number; minWidth: number };

// Only admin (oversight) and senior_sales_executive (operational) can
// perform LEAD assignments inline. Managers and sales_executives have
// no inline assign authority.
const CAN_ASSIGN_ROLES: ReadonlyArray<SessionUser['role']> = [
  'admin',
  'senior_sales_executive',
];

export default function InlineAssignmentSelector({
  branch,
  leadId,
  existing,
  actor,
  candidates,
  onChanged,
  assigneeLabel,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [popoverRect, setPopoverRect] = useState<PopoverRect | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const canAssign = CAN_ASSIGN_ROLES.includes(actor.role);

  // Open + measure popover position. Closes on outside-click + Esc.
  // Candidates are pre-fetched by the shell; no lazy load here anymore.
  const openPicker = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    // Place below the trigger by default; flip up if there's not enough room.
    const spaceBelow = window.innerHeight - r.bottom;
    const popoverHeight = 320; // approximate
    const flipUp = spaceBelow < popoverHeight && r.top > popoverHeight;
    const top = flipUp ? Math.max(8, r.top - popoverHeight - 4) : r.bottom + 4;
    const left = Math.min(
      Math.max(8, r.left),
      window.innerWidth - 280 - 8, // 280 = approx popover width
    );
    setPopoverRect({ top, left, minWidth: Math.max(r.width, 260) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Recalculate position on scroll/resize while open.
  useEffect(() => {
    if (!open) return;
    const handler = () => {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      setPopoverRect({
        top: r.bottom + 4,
        left: Math.min(Math.max(8, r.left), window.innerWidth - 280 - 8),
        minWidth: Math.max(r.width, 260),
      });
    };
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open]);

  const candidatesById = useMemo(() => {
    const m = new Map<string, SessionUser>();
    for (const u of candidates) m.set(u.id, u);
    return m;
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name ?? '').toLowerCase().includes(q),
    );
  }, [candidates, search]);

  // Phase 2U: prefer the denormalised assignee fields on the assignment
  // row itself — they're populated by the server-side `users` JOIN, so
  // we never have to fall back to displaying the raw UUID even when the
  // assignee isn't in this picker's candidate list (e.g., an admin viewing
  // an SE-owned lead from a branch they don't normally manage).
  const currentAssigneeLabel = (() => {
    if (!existing) return null;
    if (existing.assignee_name) return existing.assignee_name;
    if (existing.assignee_email) return existing.assignee_email;
    // Last-resort fallback: look up via candidates (covers stale rows
    // where the embed somehow returned null).
    const inList = candidatesById.get(existing.assigned_to);
    if (inList) return inList.name ?? inList.email;
    return assigneeLabel ?? 'Unknown user';
  })();

  const assign = async (userId: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = existing
        ? await fetch(`/api/assignments/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assigned_to: userId, notes: null }),
          })
        : await fetch('/api/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lead_id: leadId,
              branch,
              assigned_to: userId,
            }),
          });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? 'Failed to assign');
        return;
      }
      onChanged();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const unassign = async () => {
    if (!existing) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/assignments/${existing.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? 'Failed to unassign');
        return;
      }
      onChanged();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  // ── Read-only render for actors with no assign authority ─────────────────
  if (!canAssign) {
    return existing ? (
      <ReadonlyBadge label={currentAssigneeLabel ?? 'Unknown user'} />
    ) : (
      <span className="text-[11px] italic text-[#94A3B8]">Unassigned</span>
    );
  }

  // ── Trigger + portaled popover ───────────────────────────────────────────
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        disabled={saving}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          existing
            ? 'flex items-center gap-1.5 rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold text-[#0b6cbf] transition-colors hover:bg-[#DBEAFE] disabled:cursor-not-allowed disabled:opacity-60'
            : 'rounded-full border border-dashed border-[#CBD5E1] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#475569] transition-colors hover:border-[#0b6cbf] hover:text-[#0b6cbf] disabled:cursor-not-allowed disabled:opacity-60'
        }
      >
        {saving ? (
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            Saving…
          </span>
        ) : existing ? (
          <>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0b6cbf] text-[9px] font-bold text-white">
              {(currentAssigneeLabel ?? '?').charAt(0).toUpperCase()}
            </span>
            <span className="max-w-[100px] truncate">{currentAssigneeLabel}</span>
          </>
        ) : (
          '+ Assign'
        )}
      </button>

      {open && popoverRect && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Assign lead"
          style={{
            position: 'fixed',
            top: popoverRect.top,
            left: popoverRect.left,
            minWidth: popoverRect.minWidth,
            maxWidth: 320,
            zIndex: 1000,
          }}
          className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-lg"
        >
          <div className="border-b border-[#F1F5F9] p-2">
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assignees…"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm text-[#0F172A] focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20"
            />
          </div>

          {error && (
            <div role="alert" className="border-b border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto">
            {candidates.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-[#64748B]">
                No eligible assignees in this branch.
              </div>
            )}

            {filteredCandidates.length === 0 && candidates.length > 0 && (
              <div className="px-4 py-6 text-center text-xs text-[#64748B]">
                No matches for &quot;{search}&quot;.
              </div>
            )}

            {filteredCandidates.map((u) => {
              const isCurrent = existing?.assigned_to === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => !isCurrent && assign(u.id)}
                  disabled={saving || isCurrent}
                  className={
                    isCurrent
                      ? 'flex w-full items-center justify-between gap-2 bg-[#EFF6FF] px-3 py-2 text-left text-sm text-[#0b6cbf]'
                      : 'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-[#0F172A] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60'
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {u.name ?? u.email}
                    </span>
                    <span className="block truncate text-[11px] text-[#64748B]">
                      {u.email} · {ROLE_LABELS[u.role]}
                    </span>
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#0b6cbf]">
                      current
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {existing && (
            <div className="border-t border-[#F1F5F9] p-2">
              <button
                type="button"
                onClick={unassign}
                disabled={saving}
                className="w-full rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Unassign
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

function ReadonlyBadge({ label }: { label: string }) {
  const initial = label.charAt(0).toUpperCase();
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold text-[#0b6cbf]"
      title={label}
    >
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0b6cbf] text-[9px] font-bold text-white">
        {initial}
      </span>
      <span className="max-w-[100px] truncate">{label}</span>
    </span>
  );
}
