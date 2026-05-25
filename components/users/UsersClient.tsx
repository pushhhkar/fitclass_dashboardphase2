'use client';

/**
 * Orchestrator: owns the create/edit modal state, hands the rows to the
 * table, and triggers `router.refresh()` after mutations so the server
 * component re-fetches the latest list.
 *
 * Threads the ACTOR's full SessionUser down to the modals so the role
 * picker can filter options correctly under the Phase 2H hierarchy
 * (admins see all roles, managers see only sales-tier).
 */
import { useState } from 'react';
import type { SessionUser } from '@/src/types/auth';
import UsersTable from './UsersTable';
import CreateUserModal from './CreateUserModal';
import EditUserModal from './EditUserModal';

interface Props {
  /** Users the actor is allowed to manage (already filtered server-side). */
  users: SessionUser[];
  /** The actor running the page — for both ID-based self-checks and role-based
   * picker filtering. */
  actor: SessionUser;
}

export default function UsersClient({ users, actor }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SessionUser | null>(null);

  const subtitle =
    actor.role === 'admin'
      ? `${users.length} total · admin scope (all users)`
      : `${users.length} total · scoped to roles you can manage (server-enforced)`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Users</h1>
          <p className="mt-1 text-xs text-[#64748B]">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-xl bg-[#0b6cbf] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#095699]"
        >
          New user
        </button>
      </div>

      <UsersTable
        users={users}
        currentUserId={actor.id}
        actorRole={actor.role}
        onEdit={setEditTarget}
      />

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        actorRole={actor.role}
      />

      {editTarget && (
        <EditUserModal
          open={editTarget !== null}
          onClose={() => setEditTarget(null)}
          user={editTarget}
          currentUserId={actor.id}
          actorRole={actor.role}
        />
      )}
    </div>
  );
}
