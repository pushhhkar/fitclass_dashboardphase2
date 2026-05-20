'use client';

import Image from 'next/image';
import type { Dashboard } from '@/lib/config';

interface Props {
  dashboards: Dashboard[];
  activeDashboard: Dashboard;
  newLeadCount: number;
  onDashboardChange: (dashboard: Dashboard) => void;
  onClearNotifications: () => void;
}

export default function Navbar({
  dashboards,
  activeDashboard,
  newLeadCount,
  onDashboardChange,
  onClearNotifications,
}: Props) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#E2E8F0] shadow-sm shrink-0">
      <div className="flex items-center h-12 sm:h-14 md:h-[60px] px-3 sm:px-4 md:px-5 gap-2 sm:gap-3 md:gap-4 min-w-0">

        {/* Logo — shrinks on mobile */}
        <div className="shrink-0">
          <Image
            src="/fitclass-logo-white.webp"
            alt="FitClass Logo"
            width={260}
            height={60}
            priority
            className="object-contain h-8 sm:h-10 md:h-[52px] w-auto"
          />
        </div>

        {/* Divider + title — hidden on mobile to save space for buttons */}
        <div className="hidden sm:block h-4 sm:h-5 w-px bg-[#E2E8F0] shrink-0" />
        <span className="hidden sm:block font-bold text-[#0F172A] text-xs sm:text-sm tracking-tight shrink-0 whitespace-nowrap">
          Dashboard
        </span>

        {/* Dashboard toggle buttons */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {dashboards.map((d) => {
            const isActive = d.id === activeDashboard.id;
            return (
              <button
                key={d.id}
                onClick={() => onDashboardChange(d)}
                style={isActive ? {
                  background: '#0b6cbf',
                  color: '#fff',
                  border: '1px solid #0b6cbf',
                } : {
                  background: '#fff',
                  color: '#374151',
                  border: '1px solid #E2E8F0',
                }}
                className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold transition-all duration-150 hover:shadow-sm cursor-pointer whitespace-nowrap"
              >
                {d.name}
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1 min-w-0" />

        {/* New lead notification badge */}
        {newLeadCount > 0 && (
          <button
            onClick={onClearNotifications}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] text-[10px] sm:text-xs font-semibold hover:bg-[#DBEAFE] transition-colors shrink-0 whitespace-nowrap"
            title="Clear new lead notifications"
          >
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#2563EB] animate-pulse" />
            <span className="hidden sm:inline">{newLeadCount} new {newLeadCount === 1 ? 'lead' : 'leads'}</span>
            <span className="sm:hidden">{newLeadCount}</span>
          </button>
        )}
      </div>
    </header>
  );
}
