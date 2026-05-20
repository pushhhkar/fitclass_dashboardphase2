/**
 * /dashboard — protected shell. Every sub-route inherits this layout, so:
 *
 *  1. Authentication is enforced ONCE here (server-side), not in every page.
 *  2. The user object hydrates the navbar + sidebar without each child
 *     re-fetching it.
 *  3. Role-aware nav filtering happens in the sidebar/mobile-nav components
 *     using the session passed down from this layout.
 *
 * Force-dynamic because the session lives in an HTTP-only cookie that must
 * be read per-request; never prerender this tree.
 */
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionFromRequest } from '@/src/lib/auth/session';
import DashboardNavbar from '@/components/dashboard/DashboardNavbar';
import DashboardSidebar from '@/components/dashboard/DashboardSidebar';
import MobileNav from '@/components/dashboard/MobileNav';

export const dynamic = 'force-dynamic';

interface Props {
  children: ReactNode;
}

export default async function DashboardLayout({ children }: Props) {
  const session = await getSessionFromRequest();
  if (!session) {
    redirect('/login?callbackUrl=%2Fdashboard');
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#F8FAFC]">
      <DashboardNavbar user={session} />
      <MobileNav role={session.role} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <DashboardSidebar role={session.role} />
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
