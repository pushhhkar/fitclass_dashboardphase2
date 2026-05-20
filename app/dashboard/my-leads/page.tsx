/**
 * /dashboard/my-leads — any authenticated user (layout enforces auth).
 *
 * The sales-only nav visibility is UX; admins and managers reaching this
 * URL directly will see the same scaffold. Phase 2E will filter the
 * legacy Sheets-backed leads by the user's `id` via the assignments table.
 */
import { requireSessionPage } from '@/src/lib/permissions/server';
import Placeholder from '@/components/dashboard/Placeholder';

export const dynamic = 'force-dynamic';

export default async function MyLeadsPage() {
  await requireSessionPage('/dashboard/my-leads');
  return (
    <Placeholder
      title="My Leads"
      body="Leads currently assigned to you. Will read from the assignments table (Phase 2E) and surface the matching Google-Sheets row data."
    />
  );
}
