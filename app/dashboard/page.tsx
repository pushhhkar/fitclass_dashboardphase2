/**
 * /dashboard — role-aware home.
 *
 * The single-dashboard architecture: ONE URL, branched server-side by role
 * via an exhaustive `switch`. No separate admin/manager/sales portals; no
 * client-side rendering decision that could leak admin widgets to a sales
 * user. The widgets shown here are scaffolding for Phase 2E — copy is
 * intentionally minimal until each feature lands.
 */
import { requireSessionPage } from '@/src/lib/permissions/server';
import { RoleBadge } from '@/components/dashboard/RoleBadge';
import type { UserRole } from '@/src/types/auth';

export const dynamic = 'force-dynamic';

export default async function DashboardHome() {
  const session = await requireSessionPage('/dashboard');
  const greetingName = session.name ?? session.email.split('@')[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-[#0F172A]">
          Welcome, {greetingName}
        </h1>
        <RoleBadge role={session.role} />
      </header>

      <p className="text-sm text-[#64748B]">
        You are signed in as <span className="font-medium text-[#0F172A]">{session.email}</span>.
        This is your role-specific workspace home.
      </p>

      {renderForRole(session.role)}
    </div>
  );
}

// Exhaustive role render — `never` arm makes adding a new role a compile
// error here, forcing the dashboard to declare what that role sees.
function renderForRole(role: UserRole) {
  switch (role) {
    case 'admin':
      return <AdminHome />;
    case 'manager':
      return <ManagerHome />;
    case 'sales':
      return <SalesHome />;
    default: {
      const _exhaustive: never = role;
      void _exhaustive;
      return null;
    }
  }
}

function AdminHome() {
  return (
    <section
      aria-label="Admin overview"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <Card title="User management" body="Create users, assign roles, manage branch scopes." href="/dashboard/users" />
      <Card title="Analytics" body="Pipeline performance across branches (backend pending)." href="/dashboard/analytics" />
      <Card title="Assignments" body="Route incoming leads to managers and sales." href="/dashboard/assignments" />
    </section>
  );
}

function ManagerHome() {
  return (
    <section
      aria-label="Manager overview"
      className="grid gap-4 sm:grid-cols-2"
    >
      <Card title="Team" body="Members of your branch and their current load." href="/dashboard/team" />
      <Card title="Assignments" body="Distribute new leads across your team." href="/dashboard/assignments" />
    </section>
  );
}

function SalesHome() {
  return (
    <section
      aria-label="Sales overview"
      className="grid gap-4 sm:grid-cols-2"
    >
      <Card title="My Leads" body="Leads currently assigned to you." href="/dashboard/my-leads" />
    </section>
  );
}

function Card({ title, body, href }: { title: string; body: string; href?: string }) {
  const content = (
    <div className="h-full rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <h2 className="text-sm font-semibold text-[#0F172A]">{title}</h2>
      <p className="mt-2 text-xs leading-relaxed text-[#64748B]">{body}</p>
    </div>
  );
  return href ? (
    <a href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6cbf] focus-visible:ring-offset-2 rounded-xl">
      {content}
    </a>
  ) : (
    content
  );
}
