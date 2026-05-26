'use client';

/**
 * Lead-management surface — the unified replacement for the legacy CRM at `/`.
 *
 * Mounts inside `/dashboard/leads` and inherits the dashboard layout's auth
 * gate, sidebar nav, and user menu.
 *
 * ── Layout contract (read this before touching) ─────────────────────────────
 * The shell is a **clean flex column** that exactly fills its parent
 * `<main>` (height 100%). Every chrome section is `shrink-0`, the bottom
 * grid region is `flex-1 min-h-0 overflow-hidden`, and AG Grid handles its
 * own internal scrolling.
 *
 * INVARIANTS that must hold:
 *  1. `<main>` in the dashboard layout is `flex flex-col overflow-y-auto`
 *     with NO padding — full-bleed pages would otherwise need negative-
 *     margin escape hatches that break sticky positioning and overflow
 *     bookkeeping (this was the Phase 2G overlap bug).
 *  2. NO `position: sticky` in this shell. The shell fills `<main>` exactly,
 *     so there is nothing to "stick" against — adding sticky here would
 *     reintroduce z-index stacking against the chrome below it.
 *  3. NO `h-[calc(100% + Xrem)]`. Height is `100%`; period.
 *
 * ── Composition rule for future sections ────────────────────────────────────
 * New chrome rows above the grid go between the existing ones with the same
 * `shrink-0 border-b bg-white` recipe. New full-bleed surfaces go as siblings
 * to the grid region inside the flex-1 slot.
 */
import { useEffect, useState } from 'react';
import { DASHBOARDS, type Dashboard } from '@/lib/config';
import { useBranches, type DynamicBranch } from '@/hooks/useBranches';
import { useLeads } from '@/hooks/useLeads';
import BranchTabs from '@/components/BranchTabs';
import StatsCards from '@/components/StatsCards';
import LeadsTable from '@/components/LeadsTable';
import type { SessionUser } from '@/src/types/auth';

// Phase 2N performance fix: the inline assignment picker used to fetch
// `/api/users/assignable?branch=X` lazily INSIDE every row's selector —
// duplicate fetches per row, and a fresh fetch each time the user opened a
// popover. The candidate list only depends on (branch, actor), so we hoist
// the fetch to the shell, keep ONE request per branch switch, and pass the
// result down through AG Grid context. Selectors become pure renderers.
const INLINE_ASSIGN_ROLES: ReadonlyArray<SessionUser['role']> = [
  'admin',
  'manager',
  'senior_sales_executive',
];

export type CardFilter =
  | 'all'
  | 'new'
  | 'callAttempted'
  | 'unqualified'
  | 'visitScheduled'
  | 'converted';

const FILTER_LABELS: Record<CardFilter, string> = {
  all:            'All Leads',
  new:            'New Leads',
  callAttempted:  'Call Attempted',
  unqualified:    'Unqualified Leads',
  visitScheduled: 'Visit Scheduled',
  converted:      'Converted',
};

interface Props {
  /** Authenticated actor — drives the inline assignment picker's authority. */
  actor: SessionUser;
}

export default function LeadDashboardShell({ actor }: Props) {
  const [activeDashboard, setActiveDashboard] = useState<Dashboard>(DASHBOARDS[0]);
  const [activeBranch, setActiveBranch]       = useState<DynamicBranch | null>(null);
  const [activeFilter, setActiveFilter]       = useState<CardFilter>('all');

  const { branches, loading: branchesLoading, error: branchesError } =
    useBranches(activeDashboard.id);

  useEffect(() => {
    if (branches.length > 0) {
      setActiveBranch((prev) => {
        if (prev && branches.some((b) => b.id === prev.id)) return prev;
        return branches[0];
      });
    } else {
      setActiveBranch(null);
    }
  }, [branches]);

  const {
    leads, stats, loading, error,
    headers, statusOptions,
    assignments, refetch,
    newLeadCount, newLeadRowKeys,
    clearNewLeadCount,
    updateLead, transferLead,
  } = useLeads(activeDashboard.id, activeBranch?.sheetName ?? '');

  // ── Shared inline-assignment candidate cache ────────────────────────────
  // One fetch per (branch, actor) pair; shared across every row's inline
  // selector. Empty when the actor has no inline-assign authority OR when
  // no branch is selected yet.
  const [candidates, setCandidates] = useState<SessionUser[]>([]);
  const canInlineAssign = INLINE_ASSIGN_ROLES.includes(actor.role);
  const currentBranchName = activeBranch?.sheetName ?? '';

  useEffect(() => {
    if (!canInlineAssign || !currentBranchName) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/users/assignable?branch=${encodeURIComponent(currentBranchName)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) {
          if (!cancelled) setCandidates([]);
          return;
        }
        const data = (await res.json()) as { users?: SessionUser[] };
        if (cancelled) return;
        setCandidates(Array.isArray(data.users) ? data.users : []);
      } catch {
        if (!cancelled) setCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canInlineAssign, currentBranchName]);

  const handleDashboardChange = (dashboard: Dashboard) => {
    setActiveDashboard(dashboard);
    setActiveBranch(null);
    setActiveFilter('all');
  };

  const handleBranchChange = (branch: DynamicBranch) => {
    setActiveBranch(branch);
    setActiveFilter('all');
  };

  const handleFilterChange = (filter: CardFilter) => {
    setActiveFilter((prev) => (prev === filter ? 'all' : filter));
  };

  return (
    // `flex-1 min-h-0` consumes the entirety of <main> without overflowing.
    // The shell's own children either claim a fixed slot (`shrink-0`) or
    // absorb the remainder (`flex-1 min-h-0`, the grid region).
    <div className="flex min-h-0 flex-1 flex-col bg-[#F8FAFC]">

      {/* ── Source/dashboard switcher + new-lead badge ─────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[#E2E8F0] bg-white px-3 py-2 sm:px-5 sm:py-2.5">
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {DASHBOARDS.map((d) => {
            const isActive = d.id === activeDashboard.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => handleDashboardChange(d)}
                className={
                  isActive
                    ? 'rounded-full border border-[#0b6cbf] bg-[#0b6cbf] px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-all hover:shadow sm:px-3.5 sm:py-1.5 sm:text-xs'
                    : 'rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-[11px] font-semibold text-[#374151] transition-all hover:shadow-sm sm:px-3.5 sm:py-1.5 sm:text-xs'
                }
              >
                {d.name}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        {newLeadCount > 0 && (
          <button
            type="button"
            onClick={clearNewLeadCount}
            title="Clear new lead notifications"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-1 text-[10px] font-semibold text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE] sm:px-3 sm:py-1.5 sm:text-xs"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2563EB] sm:h-2 sm:w-2" />
            <span className="hidden sm:inline">
              {newLeadCount} new {newLeadCount === 1 ? 'lead' : 'leads'}
            </span>
            <span className="sm:hidden">{newLeadCount}</span>
          </button>
        )}
      </div>

      {/* ── Branch tabs ────────────────────────────────────────────────────── */}
      <div className="shrink-0">
        <BranchTabs
          branches={branches}
          activeId={activeBranch?.id ?? ''}
          loading={branchesLoading}
          onChange={handleBranchChange}
        />
      </div>

      {branchesError && (
        <div className="mx-4 mt-3 shrink-0 rounded-lg border border-orange-100 bg-orange-50 px-4 py-2 text-xs text-[#EA580C] sm:mx-6">
          Could not load tabs: {branchesError}
        </div>
      )}

      {/* ── Stats cards ────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[#E2E8F0] bg-white">
        <StatsCards
          stats={stats}
          leads={leads}
          activeFilter={activeFilter}
          onFilterChange={handleFilterChange}
        />
      </div>

      {/* ── Per-branch toolbar ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#E2E8F0] bg-white px-4 py-1.5 sm:px-5 sm:py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 text-sm font-semibold text-[#0F172A]">
            {activeBranch?.name ?? '—'}
          </span>
          {!loading && activeBranch && (
            <span className="shrink-0 rounded-full border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 text-xs font-medium tabular-nums text-[#64748B]">
              {leads.length} total
            </span>
          )}
          {activeFilter !== 'all' && (
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-0.5 text-xs font-medium text-[#0b6cbf]">
              Showing: {FILTER_LABELS[activeFilter]}
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className="ml-0.5 transition-colors hover:text-[#1e3a5f]"
                title="Clear filter"
                aria-label="Clear filter"
              >
                ×
              </button>
            </span>
          )}
        </div>
        {error && (
          <span className="shrink-0 rounded-lg border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs text-[#EA580C]">
            {error}
          </span>
        )}
      </div>

      {/* ── Grid region ────────────────────────────────────────────────────────
          `flex-1 min-h-0 overflow-hidden` is the canonical "fill remaining
          vertical space and clip" recipe. `min-h-0` is critical: without it,
          flex items refuse to shrink below their content-size and the grid
          spills, pushing the chrome rows up into each other (the original
          "collapsing/overlapping" symptom).
      */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:px-5 sm:py-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
          <LeadsTable
            leads={leads}
            loading={loading || (!activeBranch && !branchesLoading)}
            statusFilter={activeFilter}
            onUpdate={updateLead}
            onTransfer={transferLead}
            dashboardId={activeDashboard.id}
            allBranches={branches}
            activeBranchName={activeBranch?.sheetName ?? ''}
            newLeadRowKeys={newLeadRowKeys}
            headers={headers}
            statusOptions={statusOptions}
            actor={actor}
            assignments={assignments}
            assignmentCandidates={candidates}
            onAssignmentChanged={refetch}
          />
        </div>
      </div>
    </div>
  );
}
