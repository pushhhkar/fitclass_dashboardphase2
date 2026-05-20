'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface DynamicBranch {
  id: string;        // slug derived from tab name
  name: string;      // display name (= sheet tab name)
  sheetName: string; // exact Google Sheets tab name used in API calls
}

interface UseBranchesReturn {
  branches: DynamicBranch[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function tabToBranch(tabName: string): DynamicBranch {
  return {
    id: tabName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    name: tabName,
    sheetName: tabName,
  };
}

// Fetches live tab names from Google Sheets for the given dashboardId.
// New tabs appear automatically — no code or config changes needed.
export function useBranches(dashboardId: string): UseBranchesReturn {
  const [branches, setBranches] = useState<DynamicBranch[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const dashboardIdRef          = useRef(dashboardId);
  dashboardIdRef.current        = dashboardId;

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/branches?dashboardId=${encodeURIComponent(dashboardIdRef.current)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tabs: string[] = await res.json();
      setBranches(tabs.map(tabToBranch));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setBranches([]);
    fetchBranches();
  }, [dashboardId, fetchBranches]);

  return { branches, loading, error, refresh: fetchBranches };
}
