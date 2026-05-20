/**
 * /dashboard/users — admin user-management.
 *
 * Server-side admin gate is REQUIRED: a non-admin who types the URL gets
 * redirected to /dashboard before any HTML is rendered. The frontend
 * nav-hiding (sidebar) is only UX; this `requireRole('admin')` is the
 * authoritative check.
 *
 * The page fetches the user list at request time and hands a SessionUser[]
 * (no password hashes ever in scope) to the client orchestrator. Mutations
 * trigger router.refresh() in the modals so this server component re-runs
 * with the latest data.
 */
import { requireRole } from '@/src/lib/permissions/server';
import { listUsers } from '@/src/features/users/queries';
import { toSessionUsers } from '@/src/features/users/serializers';
import UsersClient from '@/components/users/UsersClient';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const admin = await requireRole('admin');
  const rows = await listUsers();
  const users = toSessionUsers(rows);

  return (
    <div className="mx-auto max-w-6xl">
      <UsersClient users={users} currentUserId={admin.id} />
    </div>
  );
}
