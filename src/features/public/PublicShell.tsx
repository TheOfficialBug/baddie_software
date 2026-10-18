import { useState } from 'react';
import { NavLink, Outlet, useLocation, useMatch } from 'react-router';

import { APP_NAME } from '@/config/app';
import { env } from '@/config/env';

import { cn } from '@/lib/cn';

import { useStore } from '@/data/store';

import { useAccess } from '@/auth/useAccess';

import { HelpButton } from '@/components/help/Help';
import { NoticeBell } from '@/components/notices/Notices';
import { BackButton } from '@/components/ui/BackButton';
import { BottomBar } from '@/components/ui/BottomBar';
import { type IconName } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { isHomePath } from '@/components/ui/parentPath';
import { ThemeSwitchButton, ThemeToggle } from '@/components/ui/ThemeToggle';

import { AccountMenu } from '@/features/auth/AccountMenu';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Tournaments', icon: 'trophy', end: true },
  { to: '/me', label: 'My matches', icon: 'user' },
  { to: '/admin', label: 'Organizer', icon: 'dashboard' },
];

/** Shell for the home, My matches and registration pages. Tournament pages have their own hero layout. */
export function PublicShell() {
  // Registration is a focused flow with its own action bar: no global tab bar on phones.
  const focused = !!useMatch('/t/:slug/register');
  const { pathname } = useLocation();
  const { isOrganizer } = useAccess();
  // the organizer desk is only offered to tournament staff
  const nav = NAV.filter((n) => n.to !== '/admin' || isOrganizer);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky z-40 border-b border-line bg-bg/90 backdrop-blur-md" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-2 px-4 sm:gap-6 sm:px-6">
          <div className="flex items-center gap-1">
            {!isHomePath(pathname) && <BackButton className="-ml-2" />}
            <Logo compact />
          </div>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 items-center rounded-full px-3 text-[14px] font-semibold transition-colors lg:px-4',
                    isActive ? 'bg-surface text-fg shadow-lift' : 'text-muted hover:text-fg',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {/* phones: help moves off the bar when the back button needs the room */}
            <span className={cn(!isHomePath(pathname) && 'hidden sm:inline-flex')}>
              <HelpButton />
            </span>
            <NoticeBell />
            <ThemeToggle className="ml-1 hidden lg:inline-flex" />
            {/* phones follow the system theme; the switch needs the room for Sign in */}
            <span className="hidden sm:inline-flex lg:hidden">
              <ThemeSwitchButton />
            </span>
            <AccountMenu className="ml-1" />
          </div>
        </div>
      </header>
      <main className="pb-safe-bar mx-auto w-full max-w-[1240px] flex-1 px-4 pt-4 sm:px-6 sm:pt-5">
        <Outlet />
      </main>
      <Footer />
      {!focused && <BottomBar items={nav} />}
    </div>
  );
}

export function Footer() {
  const reset = useStore((s) => s.resetDemo);
  const [confirm, setConfirm] = useState(false);
  if (env.supabase) return null;
  return (
    <footer className="no-print hidden border-t border-line md:block">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-6 py-5 text-[13px] text-muted">
        <span>{APP_NAME} prototype. Names, clubs and results are demo data.</span>
        <button
          className={cn('ml-auto min-h-9 rounded-full px-3 font-semibold hover:bg-sunken', confirm ? 'text-live' : 'text-fg')}
          onClick={() => {
            if (confirm) {
              reset();
              setConfirm(false);
            } else {
              setConfirm(true);
              setTimeout(() => setConfirm(false), 4000);
            }
          }}
        >
          {confirm ? 'Click again to reset everything' : 'Reset demo data'}
        </button>
      </div>
    </footer>
  );
}
