import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FitClass Leads Dashboard',
  description: 'Internal lead management for FitClass branches',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/*
        Full-viewport rigid shell.
        overflow:hidden stops the page itself from scrolling — the only
        scrollable region is the AG Grid body inside the dashboard.
        On mobile, Dashboard switches to a natural document scroll instead.
      */}
      <body
        className={`${inter.className} bg-[#F8FAFC]`}
        style={{ margin: 0, padding: 0, height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        suppressHydrationWarning
      >
        <main style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
