/**
 * /dashboard/users — ADMIN ONLY.
 *
 * Enforced SERVER-SIDE by `requireRole('admin')` (src/lib/permissions/server.ts).
 * The nav already hides this link for non-admins, but that is UX, not
 * security — typing the URL directly hits the same gate.
 *
 * Phase 2E will turn this into the live user-management UI. The data layer
 * (`createUser`, `updateUser`, `setUserActive`, `listUsers`) already exists
 * in src/features/users/{queries,mutations}.ts.
 */
import { requireRole } from '@/src/lib/permissions/server';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  await requireRole('admin');

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#0F172A]">Users</h1>
      </header>
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-medium text-[#0F172A]">User management UI lands in Phase 2E.</p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[#64748B]">
          The backend layer is in place — admins will be able to invite users,
          assign roles, scope branch access, and deactivate accounts from here.
        </p>
      </div>
    </div>
  );
}
