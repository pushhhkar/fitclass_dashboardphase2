/**
 * /dashboard/assignments — manager+ placeholder.
 *
 * Routes leads (rows from the Google-Sheets engine) to users. The
 * `assignments` table already exists (supabase/migrations/...init_auth_schema)
 * and `canAssignLeads` predicate already gates the action — this page just
 * needs the UI in Phase 2E.
 */
import { requireMinimumRole } from '@/src/lib/permissions/server';
import Placeholder from '@/components/dashboard/Placeholder';

export const dynamic = 'force-dynamic';

export default async function AssignmentsPage() {
  await requireMinimumRole('manager');
  return (
    <Placeholder
      title="Assignments"
      body="Assign leads to users and reassign across branches. Phase 2E will wire the assignments table to the legacy Sheets row id."
    />
  );
}
