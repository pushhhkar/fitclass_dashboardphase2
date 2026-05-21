/**
 * GET /api/branches/all — every CRM branch name, across every dashboard.
 *
 * Powers the admin "Allowed branches" selector. Existing /api/branches is
 * per-dashboard (the leads view only loads tabs for the current source);
 * the user-management surface needs the full union so admins can scope a
 * user to any real branch regardless of which spreadsheet hosts it.
 *
 * Authorization:
 *  - Session required.
 *  - Result is filtered through `filterAllowedBranches` so a manager (rare
 *    consumer) only ever sees branches they themselves can access. Admin's
 *    canonical view sees all.
 *
 * Caching: none today. The list rarely changes but admins SHOULD see the
 * effect of adding a new Sheets tab immediately. Add Cache-Control with a
 * short TTL only if the Sheets API call becomes a hot path.
 */
import { NextResponse } from 'next/server';
import { requireSession } from '@/src/lib/auth/session';
import { listAllBranches } from '@/src/features/branches/queries';
import { filterAllowedBranches } from '@/src/lib/permissions/branches';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const gate = await requireSession();
  if (!gate.ok) return gate.response;

  try {
    const all = await listAllBranches();
    const visible = filterAllowedBranches(gate.session, all);
    return NextResponse.json({ branches: visible }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GET /api/branches/all] error=%s', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
