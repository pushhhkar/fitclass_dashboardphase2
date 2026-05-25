'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Lead, StatsData, UpdatePayload, TransferPayload } from '@/types';
import type { AssignmentView } from '@/src/features/assignments/serializers';

const REFRESH_INTERVAL_MS = 300_000; // 5 minutes

// ── Notification helpers ──────────────────────────────────────────────────────

function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showLeadNotification(lead: Lead, branchName: string) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  const name = lead.fullName || lead.phoneNumber || 'Unknown';
  const n = new Notification('New Lead Received', {
    body: `${name} • ${branchName}`,
    icon: '/fitclass-logo-white.webp',
    tag: `lead-${lead.rowIndex}`,
  });

  n.onclick = () => {
    window.focus();
    n.close();
  };
}

// ── Stable lead key for diffing ───────────────────────────────────────────────
// rowIndex alone is unreliable for newly appended rows across fetches,
// so we compound with phone + name as a tiebreaker.
function leadKey(l: Lead): string {
  return `${l.rowIndex}::${l.phoneNumber}::${l.fullName}`;
}

// ── Date parsing for sort ─────────────────────────────────────────────────────
function parseDate(s: string): number {
  if (!s) return 0;
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function sortNewestFirst(leads: Lead[]): Lead[] {
  return [...leads].sort((a, b) => {
    const diff = parseDate(b.createdTime) - parseDate(a.createdTime);
    // Fall back to rowIndex descending when dates are equal or unparseable
    return diff !== 0 ? diff : b.rowIndex - a.rowIndex;
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseLeadsReturn {
  leads: Lead[];
  stats: StatsData;
  loading: boolean;
  error: string | null;
  headers: string[];          // live Row 1 headers — drives column order for both dashboards
  statusOptions: string[];    // dropdown options read from Sheets data validation rule
  /**
   * Assignment lookup map keyed by `lead.rowIndex`. Populated from the same
   * /api/leads call that returns leads — no extra round-trip. The inline
   * assignment selector in the leads table reads from this map to render
   * each row's current assignee.
   */
  assignments: Record<number, AssignmentView>;
  newLeadCount: number;
  newLeadRowKeys: Set<string>;
  clearNewLeadCount: () => void;
  updateLead: (payload: Omit<UpdatePayload, 'dashboardId' | 'sheetName'>) => Promise<void>;
  transferLead: (lead: Lead, targetSheetName: string) => Promise<void>;
  /**
   * Force an immediate refresh of leads + assignments. The inline assignment
   * UI calls this after a successful POST/PATCH/DELETE so the badge updates
   * without waiting for the 5-minute poll.
   */
  refetch: () => Promise<void>;
}

export function useLeads(dashboardId: string, sheetName: string): UseLeadsReturn {
  const [leads, setLeads]               = useState<Lead[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [statusOptions, setStatusOptions]   = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<number, AssignmentView>>({});
  const [newLeadCount, setNewLeadCount] = useState(0);
  const [newLeadRowKeys, setNewLeadRowKeys] = useState<Set<string>>(new Set());

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const knownKeysRef   = useRef<Set<string>>(new Set()); // keys seen on last fetch
  const isFirstFetch   = useRef(true);
  const branchNameRef  = useRef(sheetName);

  const dashboardIdRef = useRef(dashboardId);
  const sheetNameRef   = useRef(sheetName);
  dashboardIdRef.current = dashboardId;
  sheetNameRef.current   = sheetName;
  branchNameRef.current  = sheetName;

  const clearNewLeadCount = useCallback(() => {
    setNewLeadCount(0);
    setNewLeadRowKeys(new Set());
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        dashboardId: dashboardIdRef.current,
        sheet:       sheetNameRef.current,
      });
      const res = await fetch(`/api/leads?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json: {
        leads: Lead[];
        headers: string[];
        statusOptions: string[];
        assignments?: Record<number, AssignmentView>;
      } = await res.json();
      const raw = json.leads ?? [];
      // Always update headers — they drive the column schema for both dashboards.
      if (Array.isArray(json.headers)) setHeaders(json.headers);
      // Always overwrite — even an empty array is a valid response (no rule found).
      if (Array.isArray(json.statusOptions)) setStatusOptions(json.statusOptions);
      // Assignments map (Phase 2F+). Always overwrite — an empty object is a
      // valid response (no rows assigned in this branch yet).
      setAssignments(json.assignments ?? {});
      const sorted = sortNewestFirst(raw);

      if (silent && !isFirstFetch.current) {
        // Diff: find keys that weren't in the previous snapshot
        const incoming = new Set(sorted.map(leadKey));
        const newKeys  = [...incoming].filter((k) => !knownKeysRef.current.has(k));

        if (newKeys.length > 0) {
          const newLeads = sorted.filter((l) => newKeys.includes(leadKey(l)));

          // Desktop notifications
          newLeads.forEach((l) => showLeadNotification(l, branchNameRef.current));

          setNewLeadCount((prev) => prev + newLeads.length);
          setNewLeadRowKeys((prev) => new Set([...prev, ...newKeys]));

          // Remove flash class after 3.5 s to keep the ref tidy
          setTimeout(() => {
            setNewLeadRowKeys((prev) => {
              const next = new Set(prev);
              newKeys.forEach((k) => next.delete(k));
              return next;
            });
          }, 3500);
        }

        knownKeysRef.current = incoming;
      } else {
        // Initial load — just record known keys, no notification
        knownKeysRef.current = new Set(sorted.map(leadKey));
        isFirstFetch.current = false;
      }

      setLeads(sorted);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Ask for notification permission once on mount
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    setLeads([]);
    setLoading(true);
    setLastUpdated(null);
    setHeaders([]);
    setStatusOptions([]);
    setAssignments({});
    setNewLeadCount(0);
    setNewLeadRowKeys(new Set());
    isFirstFetch.current = true;
    knownKeysRef.current = new Set();

    if (timerRef.current) clearInterval(timerRef.current);

    // Defer the fetch until BOTH params are real. On the very first render
    // `sheetName` is '' because `useBranches` hasn't resolved yet — dispatching
    // here would 400 (the route validates non-empty params). Once the upstream
    // selects a branch this effect re-runs with a real sheet name and fetches.
    // Loading stays true in the meantime, so the UI keeps its existing
    // "branches/leads loading" state without showing a spurious error.
    if (!dashboardId || !sheetName) {
      // DEBUG: remove after Phase 2C — verifies the dependent-state race is gone.
      if (process.env.NODE_ENV !== 'production') {
        console.debug(
          '[useLeads] deferring fetch — waiting for branch',
          { dashboardId, sheetName },
        );
      }
      return;
    }

    // DEBUG: remove after Phase 2C
    if (process.env.NODE_ENV !== 'production') {
      const debugUrl =
        '/api/leads?' +
        new URLSearchParams({ dashboardId, sheet: sheetName }).toString();
      console.debug('[useLeads] dispatching fetch', { dashboardId, sheetName, url: debugUrl });
    }

    fetchData(false);
    timerRef.current = setInterval(() => fetchData(true), REFRESH_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [dashboardId, sheetName, fetchData]);

  const updateLead = useCallback(
    async (payload: Omit<UpdatePayload, 'dashboardId' | 'sheetName'>) => {
      setLeads((prev) =>
        prev.map((l) =>
          l.rowIndex === payload.rowIndex ? { ...l, [payload.field]: payload.value } : l
        )
      );

      const res = await fetch('/api/sheets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          dashboardId: dashboardIdRef.current,
          sheetName:   sheetNameRef.current,
        }),
      });

      if (!res.ok) {
        await fetchData(true);
        throw new Error('Failed to save to Google Sheets');
      }
    },
    [fetchData]
  );

  const transferLead = useCallback(
    async (lead: Lead, targetSheetName: string) => {
      const body: TransferPayload = {
        lead,
        targetSheetName,
        sourceSheetName: sheetNameRef.current,
        dashboardId:     dashboardIdRef.current,
      };

      const res = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to transfer lead');

      setLeads((prev) =>
        prev.map((l) =>
          l.rowIndex === lead.rowIndex ? { ...l, transferTo: targetSheetName } : l
        )
      );
    },
    []
  );

  // Public manual refresh — used by the inline assignment selector after a
  // POST/PATCH/DELETE to /api/assignments so the row's assignee badge
  // updates immediately (without waiting for the 5-minute poll).
  const refetch = useCallback(() => fetchData(true), [fetchData]);

  return {
    leads,
    stats: { total: leads.length, lastUpdated },
    loading,
    error,
    headers,
    statusOptions,
    assignments,
    newLeadCount,
    newLeadRowKeys,
    clearNewLeadCount,
    updateLead,
    transferLead,
    refetch,
  };
}
