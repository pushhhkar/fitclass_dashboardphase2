'use client';

/**
 * Orchestrator: owns the create/edit modal state, hands the rows to the
 * table, and triggers `router.refresh()` after mutations so the server
 * component re-fetches the latest list.
 */
import { useState } from 'react';
import type { SessionUser } from '@/src/types/auth';
import UsersTable from './UsersTable';
import CreateUserModal from './CreateUserModal';
import EditUserModal from './EditUserModal';

interface Props {
  users: SessionUser[];
  currentUserId: string;
}

export default function UsersClient({ users, currentUserId }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SessionUser | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Users</h1>
          <p className="mt-1 text-xs text-[#64748B]">
            {users.length} total · admin-only surface (server-enforced)
          </p>
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
        currentUserId={currentUserId}
        onEdit={setEditTarget}
      />

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      {editTarget && (
        <EditUserModal
          open={editTarget !== null}
          onClose={() => setEditTarget(null)}
          user={editTarget}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}
