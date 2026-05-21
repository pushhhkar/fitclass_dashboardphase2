'use client';

/**
 * Client orchestrator for /dashboard/assignments. Owns the modal state +
 * client-only filters; the underlying list comes from the server page.
 */
import { useMemo, useState } from 'react';
import type { SessionUser } from '@/src/types/auth';
import type { AssignmentView } from '@/src/features/assignments/serializers';
import AssigneeBadge from './AssigneeBadge';
import AssignLeadModal from './AssignLeadModal';

interface Props {
  actor: SessionUser;
  assignments: AssignmentView[];
  /** Pickable users (active, visible to the actor). Keyed lookup builds below. */
  candidates: SessionUser[];
}

export default function AssignmentsClient({ actor, assignments, candidates }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AssignmentView | null>(null);
  const [search, setSearch] = useState('');

  const candidatesById = useMemo(() => {
    const m = new Map<string, SessionUser>();
    for (const u of candidates) m.set(u.id, u);
    return m;
  }, [candidates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter((a) => {
      const owner = candidatesById.get(a.assigned_to);
      const hay = `${a.lead_id} ${a.branch} ${owner?.email ?? ''} ${owner?.name ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [assignments, search, candidatesById]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Assignments</h1>
          <p className="mt-1 text-xs text-[#64748B]">
            {assignments.length} active · server-side branch + role enforcement
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-xl bg-[#0b6cbf] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#095699]"
        >
          New assignment
        </button>
      </div>

      <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#F1F5F9] p-3 sm:p-4">
          <input
            type="search"
            placeholder="Search lead id, branch, or assignee…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[200px] flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20"
          />
          <span className="ml-auto text-xs text-[#64748B]">
            {filtered.length} of {assignments.length}
          </span>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
              <tr>
                <th className="px-4 py-2.5">Lead</th>
                <th className="px-4 py-2.5">Branch</th>
                <th className="px-4 py-2.5">Assignee</th>
                <th className="px-4 py-2.5">Assigned at</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {filtered.map((a) => (
                <tr key={a.id} className="text-[#0F172A]">
                  <td className="px-4 py-2.5 font-mono text-xs">{a.lead_id}</td>
                  <td className="px-4 py-2.5 text-[#475569]">{a.branch}</td>
                  <td className="px-4 py-2.5">
                    <AssigneeBadge user={candidatesById.get(a.assigned_to) ?? null} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[#64748B]">
                    {new Date(a.assigned_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(a)}
                      className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-[#64748B]">
                    No assignments match the search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="divide-y divide-[#F1F5F9] md:hidden">
          {filtered.map((a) => (
            <li key={a.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-all font-mono text-xs text-[#0F172A]">{a.lead_id}</p>
                  <p className="text-xs text-[#475569]">Branch: {a.branch}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(a)}
                  className="shrink-0 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1 text-xs font-semibold text-[#475569]"
                >
                  Edit
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AssigneeBadge user={candidatesById.get(a.assigned_to) ?? null} />
                <span className="text-[11px] text-[#94A3B8]">
                  {new Date(a.assigned_at).toLocaleString()}
                </span>
              </div>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-8 text-center text-xs text-[#64748B]">
              No assignments match the search.
            </li>
          )}
        </ul>
      </div>

      <AssignLeadModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        actor={actor}
        candidates={candidates}
      />

      {editing && (
        <AssignLeadModal
          open={editing !== null}
          onClose={() => setEditing(null)}
          actor={actor}
          candidates={candidates}
          existing={editing}
        />
      )}
    </div>
  );
}
