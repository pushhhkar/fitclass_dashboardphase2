'use client';

/**
 * Horizontal scroll strip of nav pills — only on mobile (`md:hidden`).
 * Mirrors the sidebar list so role-filtered nav works on every viewport.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@/src/types/auth';
import { navItemsForRole } from '@/src/config/navigation';

interface Props {
  role: UserRole;
}

export default function MobileNav({ role }: Props) {
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <nav
      aria-label="Primary mobile"
      className="flex gap-1.5 overflow-x-auto border-b border-[#E2E8F0] bg-white px-3 py-2 md:hidden"
    >
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'shrink-0 whitespace-nowrap rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1 text-xs font-semibold text-[#0b6cbf]'
                : 'shrink-0 whitespace-nowrap rounded-full border border-transparent px-3 py-1 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]'
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
