'use client';

import { useEffect, useState } from 'react';
import { DASHBOARDS, type Dashboard } from '@/lib/config';
import { useBranches, type DynamicBranch } from '@/hooks/useBranches';
import { useLeads } from '@/hooks/useLeads';
import Navbar from './Navbar';
import BranchTabs from './BranchTabs';
import StatsCards from './StatsCards';
import LeadsTable from './LeadsTable';

export type CardFilter = 'all' | 'new' | 'callAttempted' | 'unqualified' | 'visitScheduled' | 'converted';

const FILTER_LABELS: Record<CardFilter, string> = {
  all:            'All Leads',
  new:            'New Leads',
  callAttempted:  'Call Attempted',
  unqualified:    'Unqualified Leads',
  visitScheduled: 'Visit Scheduled',
  converted:      'Converted',
};

export default function Dashboard() {
  const [activeDashboard, setActiveDashboard] = useState<Dashboard>(DASHBOARDS[0]);
  const [activeBranch, setActiveBranch]       = useState<DynamicBranch | null>(null);
  const [activeFilter, setActiveFilter]       = useState<CardFilter>('all');

  const { branches, loading: branchesLoading, error: branchesError } = useBranches(activeDashboard.id);

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
    newLeadCount, newLeadRowKeys,
    clearNewLeadCount,
    updateLead, transferLead,
  } = useLeads(activeDashboard.id, activeBranch?.sheetName ?? '');

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
    setActiveFilter(prev => prev === filter ? 'all' : filter);
  };

  return (
    /*
      Desktop: rigid flex column filling the viewport shell from layout.tsx.
        - Navbar / BranchTabs / StatsCards / Toolbar → shrink-0 (fixed height)
        - .dashboard-grid-region → flex:1 1 0, minHeight:0 — takes ALL remaining
          space and hands it directly to AG Grid which fills it with its own scroll.
      Mobile: overflow-y:auto on the root + mobile card list = natural page scroll.
    */
    <div className="dashboard-root">

      {/* ── Fixed chrome ──────────────────────────────────────────────────── */}
      <Navbar
        dashboards={DASHBOARDS}
        activeDashboard={activeDashboard}
        newLeadCount={newLeadCount}
        onDashboardChange={handleDashboardChange}
        onClearNotifications={clearNewLeadCount}
      />

      <BranchTabs
        branches={branches}
        activeId={activeBranch?.id ?? ''}
        loading={branchesLoading}
        onChange={handleBranchChange}
      />

      {branchesError && (
        <div className="mx-4 sm:mx-6 mt-3 text-xs text-[#EA580C] bg-orange-50 px-4 py-2 rounded-lg border border-orange-100">
          Could not load tabs: {branchesError}
        </div>
      )}

      <StatsCards stats={stats} leads={leads} activeFilter={activeFilter} onFilterChange={handleFilterChange} />

      {/* Toolbar */}
      <div className="dashboard-toolbar">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-sm font-semibold text-[#0F172A] shrink-0">
            {activeBranch?.name ?? '—'}
          </span>
          {!loading && activeBranch && (
            <span className="text-xs text-[#64748B] bg-[#F1F5F9] border border-[#E2E8F0] px-2 py-0.5 rounded-full font-medium tabular-nums shrink-0">
              {leads.length} total
            </span>
          )}
          {activeFilter !== 'all' && (
            <span className="flex items-center gap-1 text-xs font-medium text-[#0b6cbf] bg-[#EFF6FF] border border-[#BFDBFE] px-2.5 py-0.5 rounded-full shrink-0">
              Showing: {FILTER_LABELS[activeFilter]}
              <button
                onClick={() => setActiveFilter('all')}
                className="ml-0.5 hover:text-[#1e3a5f] transition-colors"
                title="Clear filter"
              >
                ×
              </button>
            </span>
          )}
        </div>
        {error && (
          <span className="text-xs text-[#EA580C] bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100 shrink-0">
            {error}
          </span>
        )}
      </div>

      {/* ── Grid region — flex:1, hands exact height to LeadsTable ────────── */}
      <div className="dashboard-grid-region">
        <div className="dashboard-grid-card">
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
          />
        </div>
      </div>

    </div>
  );
}
