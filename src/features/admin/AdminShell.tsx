import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch, useMatches, useNavigate } from 'react-router';

import { APP_NAME, STORAGE_KEYS } from '@/config/app';

import { cn } from '@/lib/cn';
import { safeStorage } from '@/lib/storage';

import { useLookup } from '@/data/lookup';
import { useCheckIns } from '@/data/queries';
import { toast } from '@/data/toast';

import { authActions, useAuth } from '@/auth/authStore';
import { type Capability, ROLE_LABEL, type RouteHandle } from '@/auth/permissions';
import { useAccess } from '@/auth/useAccess';

import { HelpButton } from '@/components/help/Help';
import { ScoreDialog } from '@/components/match/ScoreEntry';
import { LiveDot } from '@/components/tournament/Badges';
import { Avatar } from '@/components/ui/Avatar';
import { BackButton } from '@/components/ui/BackButton';
import { ButtonLink, IconButton } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Logo, ShuttleMark } from '@/components/ui/Logo';
import { isHomePath } from '@/components/ui/parentPath';
import { Select } from '@/components/ui/Select';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

import { AdminContext } from '@/features/admin/adminContext';
import { CommandPalette } from '@/features/admin/CommandPalette';
import { PublishButton } from '@/features/admin/PublishButton';
import { NoAccess } from '@/features/auth/guards';

type NavItem = { to: string; label: string; icon: IconName; end?: boolean; badge?: number; live?: boolean; cap?: Capability };

export function AdminShell() {
  const lk = useLookup();
  const access = useAccess();
  // the simulator plays matches with made-up results: test runs on demo data only
  const demo = useAuth((s) => s.backend?.kind === 'demo');
  const m = useMatch('/admin/t/:tid/*');
  const tid = m?.params.tid;
  const t = lk.tournament(tid);
  const role = t ? access.roleIn(t.organizationId) : null;
  const checkIns = useCheckIns(t?.id);
  const needed = (useMatches().at(-1)?.handle as RouteHandle | undefined)?.cap;
  const [scoreFor, setScoreFor] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  // Desktop sidebar: full, or a narrow icon rail. Remembered on this device.
  const [collapsed, setCollapsed] = useState(() => safeStorage.get(STORAGE_KEYS.adminSidebar) === 'collapsed');
  const nav = useNavigate();
  const { pathname } = useLocation();
  const ctx = useMemo(() => ({ openScore: setScoreFor, openSearch: () => setPalette(true) }), []);

  const toggleCollapsed = useCallback(
    () =>
      setCollapsed((c) => {
        safeStorage.set(STORAGE_KEYS.adminSidebar, c ? 'expanded' : 'collapsed');
        return !c;
      }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggleCollapsed();
      }
      if (e.key === 'Escape') setDrawer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleCollapsed]);

  // Only tournaments of organizations this account is staff of.
  const mine = lk.tournaments.filter((x) => access.roleIn(x.organizationId));
  const allowed = (it: NavItem) => !it.cap || access.can(it.cap, t?.organizationId);

  const matches = t ? lk.matchesOf(t.id) : [];
  const onCourt = matches.filter((x) => x.status === 'on_court').length;
  const pendingEntries = t ? lk.eventsOf(t.id).reduce((n, e) => n + lk.entriesOf(e.id).filter((x) => x.status === 'pending').length, 0) : 0;
  // on match day: players still to check in (shown on Players)
  const checkInsLeft =
    t?.status === 'live'
      ? new Set(
          lk
            .eventsOf(t.id)
            .flatMap((e) => lk.entriesOf(e.id).filter((x) => x.status === 'accepted'))
            .flatMap((x) => x.playerIds)
            .filter((p) => !checkIns.has(p)),
        ).size
      : 0;

  const allGroups: { title: string; items: NavItem[] }[] = t
    ? [
        {
          // one home that follows the stage: registration, draws, the court board, winners
          title: '',
          items: [{ to: `/admin/t/${t.id}`, label: 'Run tournament', icon: 'dashboard', end: true, live: onCourt > 0 }],
        },
        {
          title: 'Details',
          items: [
            {
              to: `/admin/t/${t.id}/entries`,
              label: 'Entries',
              icon: 'userAdd',
              badge: pendingEntries || undefined,
              cap: 'manage_entries',
            },
            { to: `/admin/t/${t.id}/draws`, label: 'Draws', icon: 'draws', cap: 'manage_draws' },
            { to: `/admin/t/${t.id}/players`, label: 'Players', icon: 'users', badge: checkInsLeft || undefined },
            { to: `/admin/t/${t.id}/notify`, label: 'Messages', icon: 'megaphone' },
          ],
        },
        {
          title: 'More',
          items: [
            { to: `/admin/t/${t.id}/scores`, label: 'All results', icon: 'whistle' },
            { to: `/admin/t/${t.id}/slips`, label: 'Score slips', icon: 'print' },
            { to: `/admin/t/${t.id}/settings`, label: 'Settings', icon: 'settings', cap: 'manage_settings' },
            { to: '/admin/team', label: 'Team', icon: 'users' },
            ...(demo
              ? [{ to: `/admin/t/${t.id}/simulate`, label: 'Simulator', icon: 'sparkles' as const, cap: 'manage_settings' as const }]
              : []),
          ],
        },
      ]
    : [];
  const groups = allGroups.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length);

  // `rail`: the collapsed desktop sidebar (icons only, labels as tooltips).
  const navLink = (it: NavItem, rail: boolean) => (
    <NavLink
      key={it.to}
      to={it.to}
      end={it.end}
      onClick={() => setDrawer(false)}
      title={rail ? it.label : undefined}
      aria-label={rail ? it.label : undefined}
      className={({ isActive }) =>
        cn(
          'relative flex min-h-11 items-center gap-3 rounded-xl text-[14px] font-semibold transition-colors',
          rail ? 'justify-center px-0' : 'px-3.5',
          isActive ? 'bg-surface text-fg shadow-[inset_0_0_0_1px_rgb(var(--border))]' : 'text-muted hover:bg-sunken hover:text-fg',
        )
      }
    >
      <Icon name={it.icon} size={19} />
      {!rail && <span className="flex-1">{it.label}</span>}
      {it.live && <LiveDot className={cn('text-live', rail && 'absolute right-2 top-2')} />}
      {!rail && it.badge !== undefined && (
        <span className="num rounded-full bg-sunken px-2 text-[11.5px] font-semibold text-muted">{it.badge}</span>
      )}
    </NavLink>
  );

  const signOut = async () => {
    await authActions.signOut();
    toast('Signed out');
    nav('/', { replace: true });
  };

  const sidebar = (rail: boolean) => (
    <div className={cn('flex h-full flex-col gap-6 overflow-y-auto overflow-x-hidden py-6', rail ? 'items-stretch px-3' : 'px-4')}>
      <div className={cn('flex items-center', rail ? 'justify-center' : 'justify-between gap-2 px-2')}>
        {rail ? (
          <Link to="/admin" aria-label={`${APP_NAME} organizer home`} title="All tournaments">
            <ShuttleMark />
          </Link>
        ) : (
          <Logo to="/admin" />
        )}
      </div>
      {t && !rail && (
        <div className="flex flex-col gap-1.5 px-1">
          <label htmlFor="admin-tournament" className="eyebrow px-1">
            Tournament
          </label>
          <Select
            id="admin-tournament"
            className="text-[14px] font-semibold"
            value={t.id}
            onChange={(e) => {
              nav(`/admin/t/${e.target.value}`);
              setDrawer(false);
            }}
          >
            {mine.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
          {role && <span className="px-1 text-[12.5px] text-muted">Your role: {ROLE_LABEL[role]}</span>}
        </div>
      )}
      <nav className="flex flex-col gap-5" aria-label="Organizer">
        {!t && (
          <div className="flex flex-col gap-0.5">
            {navLink({ to: '/admin', label: 'All tournaments', icon: 'trophy', end: true }, rail)}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-0.5">
            {g.title &&
              (rail ? (
                <span className="mx-auto mb-1 h-px w-6 bg-line" aria-hidden />
              ) : (
                <div className="eyebrow mb-1 px-3.5">{g.title}</div>
              ))}
            {g.items.map((it) => navLink(it, rail))}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1">
        {t && navLink({ to: `/t/${t.slug}`, label: 'View public page', icon: 'external' }, rail)}
        {t && navLink({ to: '/admin', label: 'All tournaments', icon: 'trophy', end: true }, rail)}
        {navLink({ to: '/account', label: 'Account settings', icon: 'settings' }, rail)}
        {!rail && (
          <>
            <div className="eyebrow mt-3 px-2">Theme</div>
            <ThemeToggle labels className="mb-2 w-full" />
          </>
        )}
        <div className={cn('flex items-center gap-3 border-t border-line pt-3.5', rail ? 'flex-col' : 'px-2')}>
          <span title={rail ? `${access.user?.name} · ${access.user?.email}` : undefined}>
            <Avatar name={access.user?.name ?? '?'} size={36} />
          </span>
          {!rail && (
            <span className="flex min-w-0 flex-1 flex-col text-[13px] leading-tight">
              <strong className="truncate">{access.user?.name}</strong>
              <span className="truncate text-muted">{role ? ROLE_LABEL[role] : access.user?.email}</span>
            </span>
          )}
          <IconButton label="Sign out" onClick={signOut}>
            <Icon name="logout" size={18} />
          </IconButton>
        </div>
      </div>
    </div>
  );

  const bottom: NavItem[] = t
    ? (
        [
          { to: `/admin/t/${t.id}`, label: 'Run', icon: 'dashboard', end: true, live: onCourt > 0 },
          { to: `/admin/t/${t.id}/entries`, label: 'Entries', icon: 'userAdd', cap: 'manage_entries' },
          { to: `/admin/t/${t.id}/draws`, label: 'Draws', icon: 'draws', cap: 'manage_draws' },
          { to: `/admin/t/${t.id}/players`, label: 'Players', icon: 'users' },
        ] satisfies NavItem[]
      ).filter(allowed)
    : [];

  // Access for the page being shown: staff of this tournament's organization, with the page's capability.
  let page = <Outlet />;
  if (tid && !t)
    page = (
      <NoAccess
        icon="search"
        title="Tournament not found"
        body="It may have been removed."
        actions={<ButtonLink to="/admin">All tournaments</ButtonLink>}
      />
    );
  else if (t && !role)
    page = (
      <NoAccess
        title="You're not on this tournament's team"
        body={`Ask the owner of ${t.name} to add ${access.user?.email ?? 'you'} to the team.`}
        actions={<ButtonLink to="/admin">Your tournaments</ButtonLink>}
      />
    );
  else if (t && needed && !access.can(needed, t.organizationId))
    page = (
      <NoAccess
        title="This page is for tournament admins"
        body={`As ${role ? ROLE_LABEL[role].toLowerCase() : 'staff'}, you run match day: courts, scores and notifications. Ask an owner if you need more.`}
        actions={<ButtonLink to={`/admin/t/${t.id}`}>Back to the tournament</ButtonLink>}
      />
    );

  return (
    <AdminContext.Provider value={ctx}>
      <div className="flex min-h-dvh">
        <aside
          className={cn(
            'sticky top-0 hidden h-dvh shrink-0 border-r border-line transition-[width] duration-200 lg:block',
            collapsed ? 'w-[76px]' : 'w-[264px]',
          )}
          aria-label="Organizer sidebar"
        >
          {sidebar(collapsed)}
        </aside>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Close menu"
              className="absolute inset-0 cursor-default bg-[rgb(var(--shadow)/0.5)]"
              onClick={() => setDrawer(false)}
            />
            <aside
              className="absolute inset-y-0 left-0 w-[300px] max-w-[88vw] animate-rise border-r border-line bg-bg"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              <IconButton label="Close menu" className="absolute right-3 top-4 z-10" onClick={() => setDrawer(false)}>
                <Icon name="close" size={20} />
              </IconButton>
              {sidebar(false)}
            </aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky z-30 border-b border-line bg-bg/90 backdrop-blur-md" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
            <div className="flex h-16 items-center gap-2 px-3 sm:px-5 lg:px-8">
              <IconButton label="Open menu" className="lg:hidden" onClick={() => setDrawer(true)}>
                <Icon name="menu" size={22} />
              </IconButton>
              {!isHomePath(pathname) && <BackButton />}
              <IconButton
                label={collapsed ? 'Expand sidebar (Ctrl+\\)' : 'Collapse sidebar (Ctrl+\\)'}
                className="hidden lg:inline-flex"
                aria-pressed={collapsed}
                onClick={toggleCollapsed}
              >
                <Icon name={collapsed ? 'expand' : 'collapse'} size={20} />
              </IconButton>
              <Link to="/admin" className="flex min-w-0 items-center gap-2 lg:hidden" aria-label={`${APP_NAME} organizer home`}>
                <ShuttleMark size={30} />
                <span className="truncate font-display text-[17px] font-extrabold">{t?.name ?? APP_NAME}</span>
              </Link>
              {t && role && (
                <button
                  onClick={() => setPalette(true)}
                  className="ml-auto flex min-h-11 items-center gap-2.5 rounded-full border border-line bg-surface px-3.5 text-[14px] text-muted transition-colors hover:border-fg/40 lg:ml-0 lg:w-[360px]"
                  aria-label="Find a match or player"
                >
                  <Icon name="search" size={18} />
                  <span className="hidden flex-1 text-left sm:inline">Find a match # or player</span>
                  <kbd className="num hidden rounded-md bg-sunken px-1.5 text-[11px] font-semibold lg:inline">Ctrl K</kbd>
                </button>
              )}
              <div className={cn('flex items-center gap-1.5', !(t && role) && 'ml-auto', t && role && 'lg:ml-auto')}>
                {t && role && <PublishButton t={t} canPublish={access.can('manage_settings', t.organizationId)} />}
                <HelpButton audience="admin" />
              </div>
            </div>
          </header>
          <main className="pb-safe-bar mx-auto w-full max-w-[1320px] flex-1 px-3 pt-4 sm:px-5 lg:px-8 lg:pt-5">{page}</main>
        </div>
      </div>
      {t && role && (
        <nav
          aria-label="Organizer"
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 backdrop-blur-md lg:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {bottom.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                cn(
                  'relative flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
                  isActive ? 'text-fg' : 'text-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('absolute top-0 h-1 w-7 rounded-b-full', isActive ? 'bg-primary' : 'bg-transparent')} aria-hidden />
                  <span className="relative">
                    <Icon name={it.icon} size={22} strokeWidth={isActive ? 2 : 1.7} />
                    {it.live && <span className="absolute -right-1 -top-0.5 h-2 w-2 animate-pulse-dot rounded-full bg-live" aria-hidden />}
                  </span>
                  {it.label}
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setDrawer(true)}
            className="flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted"
          >
            <Icon name="more" size={22} />
            More
          </button>
        </nav>
      )}
      <ScoreDialog matchId={scoreFor} onClose={() => setScoreFor(null)} />
      {t && role && palette && (
        <CommandPalette
          lk={lk}
          tid={t.id}
          onClose={() => setPalette(false)}
          onPick={(mid) => {
            setPalette(false);
            setScoreFor(mid);
          }}
        />
      )}
    </AdminContext.Provider>
  );
}
