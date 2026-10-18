import { useState } from 'react';
import { Link } from 'react-router';

import { RULES } from '@/engine/rules';
import type { Tournament } from '@/engine/types';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { fmtDate, fmtDateRange } from '@/lib/format';

import { type Lookup, useLookup } from '@/data/lookup';
import { registrationOpen } from '@/data/registration';

import { useAccess } from '@/auth/useAccess';

import { EventChip, LiveDot, Pill } from '@/components/tournament/Badges';
import { ButtonLink } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SearchInput } from '@/components/ui/SearchInput';
import { SectionHead } from '@/components/ui/Section';

import { featuredTournament } from '@/features/public/home/featured';
import { Welcome } from '@/features/public/home/Welcome';

export function Home() {
  useDocumentTitle('Badminton tournaments');
  const lk = useLookup();
  const access = useAccess();
  const [q, setQ] = useState('');
  const match = (t: Tournament) => !q.trim() || `${t.name} ${t.city} ${t.venue}`.toLowerCase().includes(q.trim().toLowerCase());
  const live = lk.tournaments.filter((t) => t.status === 'live' && match(t));
  // open for entries, or closed and waiting for the draw
  const open = lk.tournaments.filter((t) => (t.status === 'registration' || t.status === 'closed') && match(t));
  const done = lk.tournaments.filter((t) => t.status === 'completed' && match(t));
  const featured = featuredTournament(lk);
  const firstLive = lk.tournaments.find((t) => t.status === 'live');
  const firstOpen = lk.tournaments.find((t) => registrationOpen(t));

  const paths: { icon: IconName; title: string; body: string; to: string; cta: string }[] = [
    {
      icon: 'live',
      title: 'Follow live scores',
      body: 'Every court, bracket and result, updated as the desk enters scores.',
      to: firstLive ? `/t/${firstLive.slug}` : '/',
      cta: firstLive ? `Open ${firstLive.name}` : 'See tournaments',
    },
    {
      icon: 'userAdd',
      title: 'Register to play',
      body: 'Pick your events, add a doubles partner and pay in one go.',
      to: firstOpen ? `/t/${firstOpen.slug}/register` : '/waitlist',
      cta: firstOpen ? 'Find an event' : 'Join the waitlist',
    },
    {
      icon: 'whistle',
      title: 'Run a tournament',
      body: 'Entries, draws, courts and score slips, all from one desk.',
      // staff go to the desk; everyone else can ask for organizer access
      to: access.isOrganizer ? '/admin' : '/waitlist?as=organizer',
      cta: access.isOrganizer ? 'Open the organizer desk' : 'Get organizer access',
    },
  ];

  // a tournament to welcome people to: the promotion homepage, then any other tournaments
  if (featured && !q) {
    const others = lk.tournaments.filter((t) => t.id !== featured.id && t.status !== 'draft');
    return (
      <div className="flex flex-col gap-12">
        <Welcome t={featured} lk={lk} />
        {others.length > 0 && (
          <section>
            <SectionHead title="More tournaments" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {others.map((t) => (
                <TournamentCard key={t.id} lk={lk} t={t} />
              ))}
            </div>
          </section>
        )}
        <p className="text-center text-[13px] text-muted">
          Running the tournament?{' '}
          <Link
            to={access.isOrganizer ? '/admin' : '/login?next=%2Fadmin'}
            className="inline-block py-3 font-semibold text-fg underline underline-offset-4"
          >
            {access.isOrganizer ? 'Open the organizer desk' : 'Organizer sign in'}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-12">
      <section className="hero relative overflow-hidden rounded-2xl px-5 py-8 sm:px-10 sm:py-12">
        <div className="relative z-10 flex max-w-2xl flex-col gap-4">
          <span className="eyebrow text-hero-muted">Badminton tournaments, live</span>
          <h1 className="font-display text-[clamp(34px,6vw,60px)] font-extrabold leading-[1.02]">
            Scores, draws and courts, right on your phone.
          </h1>
          <p className="max-w-[52ch] text-[16px] text-hero-muted">
            Find your tournament to see who's on court, follow the bracket, and know when it's your turn to play.
          </p>
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search by tournament or city"
            label="Search tournaments"
            className="mt-2 max-w-md text-fg"
          />
        </div>
        <ShuttleArt />
      </section>

      <section aria-label="What would you like to do?" className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {paths.map((p, i) => (
          <Link key={p.title} to={p.to} className="panel panel-hover group flex flex-col gap-3 p-5">
            <span
              className={
                i === 0
                  ? 'grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-fg'
                  : 'grid h-12 w-12 place-items-center rounded-full bg-sunken text-fg'
              }
            >
              <Icon name={p.icon} size={24} />
            </span>
            <div>
              <h2 className="font-display text-[20px] font-bold">{p.title}</h2>
              <p className="mt-1 text-[14px] text-muted">{p.body}</p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5 text-[14px] font-semibold">
              {p.cta} <Icon name="right" size={16} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </section>

      {live.length > 0 && (
        <section>
          <SectionHead title="Live now" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {live.map((t) => (
              <TournamentCard key={t.id} lk={lk} t={t} />
            ))}
          </div>
        </section>
      )}
      {open.length > 0 && (
        <section>
          <SectionHead title="Coming up" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {open.map((t) => (
              <TournamentCard key={t.id} lk={lk} t={t} />
            ))}
          </div>
        </section>
      )}
      {done.length > 0 && (
        <section>
          <SectionHead title="Recent results" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {done.map((t) => (
              <TournamentCard key={t.id} lk={lk} t={t} />
            ))}
          </div>
        </section>
      )}
      {!live.length && !open.length && !done.length && <p className="text-muted">No tournaments match “{q}”.</p>}
    </div>
  );
}

/** Decorative shuttlecock outline in the hero (hidden on small screens). */
function ShuttleArt() {
  return (
    <svg
      viewBox="0 0 200 240"
      className="pointer-events-none absolute -right-6 top-1/2 hidden h-[118%] -translate-y-1/2 text-hero-fg/10 md:block"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      aria-hidden
    >
      <path d="M40 20h120l-38 140H78z" />
      <path d="M78 20l12 140M122 20l-12 140M55 70h90M66 115h68" />
      <circle cx="100" cy="190" r="34" fill="rgb(var(--primary))" stroke="none" opacity=".9" />
    </svg>
  );
}

export function TournamentCard({ lk, t }: { lk: Lookup; t: Tournament }) {
  const events = lk.eventsOf(t.id);
  const matches = lk.matchesOf(t.id).filter((m) => m.status !== 'bye');
  const done = matches.filter((m) => m.status === 'finished').length;
  const onCourt = matches.filter((m) => m.status === 'on_court').length;
  const players = new Set(events.flatMap((e) => lk.entriesOf(e.id).flatMap((x) => x.playerIds))).size;

  return (
    <div className="panel panel-hover relative flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {t.status === 'live' && (
            <Pill tone="live" className="mb-1 self-start">
              <LiveDot /> Live · {onCourt} on court
            </Pill>
          )}
          {registrationOpen(t) && (
            <Pill tone="info" className="mb-1 self-start">
              Registration closes {fmtDate(t.regCloses ?? t.startDate, { month: 'short', day: 'numeric' })}
            </Pill>
          )}
          {(t.status === 'closed' || (t.status === 'registration' && !registrationOpen(t))) && (
            <Pill tone="muted" className="mb-1 self-start">
              Registration closed · draws coming soon
            </Pill>
          )}
          {t.status === 'completed' && (
            <Pill tone="ok" className="mb-1 self-start">
              Completed
            </Pill>
          )}
          <Link
            to={`/t/${t.slug}`}
            className="font-display text-[clamp(22px,2.4vw,26px)] font-extrabold leading-tight after:absolute after:inset-0 hover:underline"
          >
            {t.name}
          </Link>
          <p className="text-[14px] text-muted">
            {t.venue}, {t.city} · {fmtDateRange(t.startDate, t.endDate)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {events.map((e) => (
          <EventChip key={e.id} kind={e.kind} label={e.maxAge ? `${e.kind} U${e.maxAge}` : e.kind} />
        ))}
        <span className="ml-auto text-[12.5px] text-muted">
          {players} players · {RULES[t.rules].short}
        </span>
      </div>
      {t.status === 'live' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[13px] font-semibold">
            <span>Matches complete</span>
            <span className="num">
              {done} / {matches.length}
            </span>
          </div>
          <ProgressBar value={done} max={matches.length} />
        </div>
      )}
      <div className="relative z-10 flex flex-wrap gap-2">
        <ButtonLink
          to={`/t/${t.slug}`}
          variant={t.status === 'live' ? 'primary' : 'secondary'}
          size="sm"
          iconRight={<Icon name="right" size={16} />}
        >
          {t.status === 'live' ? 'Watch live' : t.status === 'registration' ? 'See events' : 'See results'}
        </ButtonLink>
        {registrationOpen(t) && (
          <ButtonLink to={`/t/${t.slug}/register`} variant="primary" size="sm">
            Register
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
