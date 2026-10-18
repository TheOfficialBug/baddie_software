import { Outlet, useParams } from 'react-router';

import { RULES } from '@/engine/rules';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { fmtDate, fmtDateRange } from '@/lib/format';

import { useLookup } from '@/data/lookup';
import { registrationOpen } from '@/data/registration';

import { useAccess } from '@/auth/useAccess';

import { HelpButton } from '@/components/help/Help';
import { NotFound } from '@/components/NotFound';
import { NoticeBell } from '@/components/notices/Notices';
import { LiveDot, Pill } from '@/components/tournament/Badges';
import { PlayerSearch } from '@/components/tournament/PlayerSearch';
import { BackButton } from '@/components/ui/BackButton';
import { BottomBar } from '@/components/ui/BottomBar';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { TabLinks } from '@/components/ui/Tabs';
import { ThemeSwitchButton } from '@/components/ui/ThemeToggle';

import { AccountMenu } from '@/features/auth/AccountMenu';
import { Footer } from '@/features/public/PublicShell';
import type { TCtx } from '@/features/public/tournament/tournamentContext';

/** Public tournament page (design: "Public live page" + "Public live — phone"). */
export function TournamentLayout() {
  const { slug } = useParams();
  const lk = useLookup();
  const found = lk.bySlug(slug);
  const access = useAccess();
  // a draft is the organizers' work in progress: only their staff can open it until it's published
  const t = found && (found.status !== 'draft' || access.roleIn(found.organizationId)) ? found : undefined;
  useDocumentTitle(t?.name ?? 'Tournament not found');
  if (!t)
    return (
      <div className="px-4">
        <NotFound what="tournament" />
      </div>
    );
  const base = `/t/${t.slug}`;
  const onCourt = lk.matchesOf(t.id).filter((m) => m.status === 'on_court').length;
  const events = lk.eventsOf(t.id);
  const entries = events.reduce((n, e) => n + lk.entriesOf(e.id).filter((x) => x.status !== 'withdrawn').length, 0);
  const rules = RULES[t.rules];

  const tabs = [
    {
      to: base,
      label: t.status === 'live' ? 'Live' : 'Overview',
      end: true,
      icon: t.status === 'live' ? ('live' as const) : ('dashboard' as const),
    },
    { to: `${base}/courts`, label: 'Courts', icon: 'location' as const, badge: onCourt > 0 },
    { to: `${base}/draws`, label: 'Draws', icon: 'draws' as const },
    { to: `${base}/schedule`, label: 'Schedule', icon: 'calendar' as const },
    { to: `${base}/players`, label: 'Players', icon: 'users' as const },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="hero" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 pt-4 sm:gap-6 sm:px-6 sm:pt-5 lg:px-10">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
              <BackButton tone="hero" />
              <Logo tone="hero" compact />
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              {/* phones keep the bell and account; help and theme (which follows the system) need the room */}
              <span className="hidden sm:inline-flex">
                <HelpButton tone="hero" />
              </span>
              <NoticeBell tone="hero" tournamentId={t.id} />
              <span className="hidden sm:inline-flex">
                <ThemeSwitchButton tone="hero" />
              </span>
              <AccountMenu tone="hero" />
              {registrationOpen(t) && (
                <ButtonLink to={`${base}/register`} variant="primary" className="ml-1 hidden sm:inline-flex">
                  Register
                </ButtonLink>
              )}
              {t.status === 'live' && (
                <ButtonLink to={`${base}/tv`} variant="onHero" icon={<Icon name="tv" size={18} />} className="ml-1 hidden lg:inline-flex">
                  TV mode
                </ButtonLink>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pb-1">
            <div className="flex min-w-0 flex-col gap-2.5">
              <div className="flex flex-wrap gap-2">
                {t.status === 'live' && (
                  <Pill tone="live">
                    <LiveDot /> Live now · {onCourt} {onCourt === 1 ? 'court' : 'courts'}
                  </Pill>
                )}
                {registrationOpen(t) && (
                  <Pill tone="lime">Registration open until {fmtDate(t.regCloses ?? t.startDate, { month: 'short', day: 'numeric' })}</Pill>
                )}
                {t.status === 'closed' && <Pill tone="hero">Registration closed · draws coming soon</Pill>}
                {t.status === 'completed' && <Pill tone="hero">Completed</Pill>}
                <Pill tone="hero" title={rules.note}>
                  Scoring {rules.short}
                </Pill>
              </div>
              <h1 className="font-display text-[clamp(30px,5.5vw,60px)] font-extrabold leading-[1.02]">{t.name}</h1>
              <p className="text-[14px] text-hero-muted sm:text-[15px]">
                {t.venue}, {t.city} · {fmtDateRange(t.startDate, t.endDate)} · {entries} entries · {events.length} events
              </p>
            </div>
            <PlayerSearch lk={lk} t={t} className="w-full sm:w-[320px]" />
          </div>
          {registrationOpen(t) && (
            <ButtonLink to={`${base}/register`} variant="primary" size="lg" className="sm:hidden">
              Register for this tournament
            </ButtonLink>
          )}
          <TabLinks
            tone="hero"
            className="-mx-3 hidden md:flex"
            items={tabs.map(({ to, label, end, badge }) => ({
              to,
              label,
              end,
              badge: badge ? <LiveDot className="text-live" /> : undefined,
            }))}
          />
          <div className="h-2 md:hidden" />
        </div>
      </header>

      <main className="pb-safe-bar mx-auto w-full max-w-[1240px] flex-1 px-4 pt-6 sm:px-6 sm:pt-8 lg:px-10">
        <Outlet context={{ t, lk } satisfies TCtx} />
      </main>
      <Footer />
      <BottomBar items={tabs.map(({ to, label, end, icon, badge }) => ({ to, label, end, icon, badge }))} />
    </div>
  );
}
