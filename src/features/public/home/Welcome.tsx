import { Link } from 'react-router';

import type { Tournament } from '@/engine/types';

import { cn } from '@/lib/cn';
import { fmtAgo, fmtDate, fmtDateRange } from '@/lib/format';

import type { Lookup } from '@/data/lookup';
import { useStore } from '@/data/store';

import { useNoticesFor } from '@/components/notices/useNotices';
import { CountUp } from '@/components/promo/CountUp';
import { WaitlistButton } from '@/components/promo/WaitlistButton';
import { Icon, type IconName } from '@/components/ui/Icon';

const delay = (ms: number) => ({ animationDelay: `${ms}ms` });

/** Animated "Welcome to {tournament}" with live numbers and the way in to everything players look for. */
export function Welcome({ t, lk }: { t: Tournament; lk: Lookup }) {
  const matches = useStore((s) => s.matches);
  const notices = useNoticesFor(null, t.id);
  const events = lk.eventsOf(t.id);
  const evIds = new Set(events.map((e) => e.id));
  const mine = matches.filter((m) => evIds.has(m.eventId) && m.number > 0);
  const onCourt = mine.filter((m) => m.status === 'on_court').length;
  const played = mine.filter((m) => m.status === 'finished').length;
  const players = new Set(events.flatMap((e) => lk.entriesOf(e.id).flatMap((x) => x.playerIds))).size;
  const live = t.status === 'live';
  const words = t.name.split(/\s+/);
  const base = `/t/${t.slug}`;
  const news = [...notices].sort((a, b) => b.at - a.at).slice(0, 4);

  const tiles: { icon: IconName; title: string; sub: string; to: string; accent?: boolean }[] = [
    { icon: 'draws', title: 'Draws', sub: `${events.length} event${events.length === 1 ? '' : 's'}, every bracket`, to: `${base}/draws` },
    { icon: 'users', title: 'Players', sub: players ? `${players} players · find yours` : 'Find a player', to: `${base}/players` },
    {
      icon: live ? 'live' : 'calendar',
      title: 'Matches',
      sub: live ? `${onCourt} on court now` : `${mine.length} matches`,
      to: live ? `${base}/courts` : `${base}/schedule`,
      accent: live,
    },
    { icon: 'bell', title: 'Notifications', sub: notices.length ? `${notices.length} from the desk` : 'Calls and news', to: '#updates' },
  ];

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <section
        className="hero relative isolate overflow-hidden rounded-[28px] px-5 pb-8 pt-7 sm:px-10 sm:pb-12 sm:pt-10"
        aria-labelledby="welcome-title"
      >
        {/* glow orbs and the flight of a shuttle */}
        <div
          aria-hidden
          className="promo-orb pointer-events-none absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full bg-primary/25 blur-3xl"
        />
        <div
          aria-hidden
          className="promo-orb pointer-events-none absolute -bottom-32 -left-20 -z-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
          style={{ animationDelay: '-6s' }}
        />
        <svg
          aria-hidden
          viewBox="0 0 400 220"
          className="pointer-events-none absolute -right-6 top-4 -z-10 hidden h-[260px] w-[480px] opacity-60 md:block"
        >
          <path
            className="promo-trail promo-trail-draw"
            d="M10 200 C 120 20, 260 10, 380 90"
            fill="none"
            stroke="rgb(var(--primary))"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <div
          aria-hidden
          className="promo-float pointer-events-none absolute right-6 top-6 grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-fg shadow-lg sm:right-14 sm:top-10 sm:h-24 sm:w-24"
        >
          <Icon name="shuttle" size={34} />
        </div>

        <div className="flex max-w-3xl flex-col gap-4">
          <div className="promo-in flex flex-wrap items-center gap-x-2 gap-y-1.5 pr-20 sm:pr-32" style={delay(0)}>
            {live ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-live px-3 py-1 text-[13px] font-bold text-white">
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                Live now
              </span>
            ) : (
              <span className="rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold">
                {t.status === 'completed'
                  ? 'Results are in'
                  : `Starts ${fmtDate(t.startDate, { weekday: 'long', month: 'long', day: 'numeric' })}`}
              </span>
            )}
            <span className="basis-full text-[13px] text-hero-muted sm:basis-auto">
              {t.venue ? `${t.venue}, ` : ''}
              {t.city} · {fmtDateRange(t.startDate, t.endDate)}
            </span>
          </div>

          <h1 id="welcome-title" className="font-display font-extrabold leading-[0.98]">
            <span className="promo-in block text-[clamp(18px,2.6vw,26px)] font-bold text-hero-muted" style={delay(120)}>
              Welcome to
            </span>
            <span className="mt-1 block pr-16 text-[clamp(40px,8.5vw,84px)] sm:pr-28">
              {words.map((w, i) => (
                <span key={i} className="promo-word promo-shine-text mr-[0.22em]" style={delay(260 + i * 130)}>
                  {w}
                </span>
              ))}
            </span>
          </h1>
          <span aria-hidden className="promo-bar block h-1.5 w-28 rounded-full bg-primary" />

          <p className="promo-in max-w-xl text-[16px] text-hero-muted sm:text-[17px]" style={delay(700)}>
            {live
              ? 'Every court, every point and every draw, live on your phone. Find your next match and never miss a call.'
              : 'Draws, players and every match of the tournament, right on your phone.'}
          </p>

          <dl className="promo-in mt-1 grid max-w-xl grid-cols-3 gap-2 sm:gap-3" style={delay(850)}>
            {[
              { label: 'Players', value: players },
              { label: live ? 'On court' : 'Events', value: live ? onCourt : events.length },
              { label: 'Played', value: played },
            ].map((s) => (
              <div key={s.label} className="min-w-0 rounded-2xl bg-white/[0.07] px-3 py-3 ring-1 ring-white/10 sm:px-4">
                <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-hero-muted sm:text-[12px]">{s.label}</dt>
                <dd className="num font-display text-[28px] font-extrabold leading-tight sm:text-[34px]">
                  <CountUp value={s.value} />
                </dd>
              </div>
            ))}
          </dl>

          <div className="promo-in mt-3 flex flex-wrap items-center gap-x-6 gap-y-4" style={delay(1000)}>
            <Link
              to={live ? `${base}/courts` : base}
              className={cn(
                'inline-flex min-h-14 shrink-0 items-center justify-center gap-2.5 whitespace-nowrap rounded-full px-7 text-[17px] font-bold transition-transform',
                live ? 'btn-live' : 'border border-hero-line/25 text-hero-fg hover:bg-hero-line/10',
              )}
            >
              {live ? (
                <span className="relative flex h-3 w-3" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
                </span>
              ) : (
                <Icon name="right" size={20} />
              )}
              {live ? 'Watch live' : 'Open the tournament'}
            </Link>
            <WaitlistButton size="lg" from="home-hero" />
          </div>
        </div>
      </section>

      <section aria-label={`${t.name}: where to go`} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((x, i) => {
          const body = (
            <>
              <span
                className={cn(
                  'grid h-12 w-12 place-items-center rounded-2xl transition-transform group-hover:scale-110',
                  x.accent ? 'bg-live text-white' : 'bg-primary text-primary-fg',
                )}
              >
                <Icon name={x.icon} size={24} />
              </span>
              <div>
                <h2 className="font-display text-[19px] font-extrabold sm:text-[21px]">{x.title}</h2>
                <p className="mt-0.5 text-[13.5px] text-muted">{x.sub}</p>
              </div>
              <Icon name="right" size={18} className="absolute right-4 top-5 text-faint transition-transform group-hover:translate-x-1" />
            </>
          );
          const cls = 'panel panel-hover group relative flex animate-rise flex-col gap-3 p-4 sm:p-5';
          return x.to.startsWith('#') ? (
            <a key={x.title} href={x.to} className={cls} style={delay(1100 + i * 90)}>
              {body}
            </a>
          ) : (
            <Link key={x.title} to={x.to} className={cls} style={delay(1100 + i * 90)}>
              {body}
            </Link>
          );
        })}
      </section>

      <section id="updates" aria-labelledby="updates-title" className="scroll-mt-20">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="updates-title" className="font-display text-[22px] font-extrabold">
            From the desk
          </h2>
          <span className="hidden text-[13px] text-muted sm:inline">Court calls show in the bell for your matches</span>
        </div>
        {news.length ? (
          <ul className="panel flex flex-col divide-y divide-line">
            {news.map((n, i) => (
              <li key={n.id} className="flex animate-rise gap-3 p-4 sm:px-5" style={delay(i * 70)}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunken">
                  <Icon
                    name={n.kind === 'call' ? 'location' : n.kind === 'draw' ? 'draws' : n.kind === 'result' ? 'trophy' : 'megaphone'}
                    size={19}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{n.title}</span>
                    <span className="shrink-0 text-[12.5px] text-muted">{fmtAgo(n.at)}</span>
                  </div>
                  {n.body && <p className="mt-0.5 text-[14px] text-muted">{n.body}</p>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel p-5 text-[14px] text-muted">Announcements from the tournament desk show up here.</p>
        )}
      </section>

      <section className="relative isolate overflow-hidden rounded-[28px] bg-sunken p-6 sm:p-10" aria-labelledby="waitlist-band">
        <div
          aria-hidden
          className="promo-orb pointer-events-none absolute -right-20 -top-20 -z-10 h-64 w-64 rounded-full bg-primary/30 blur-3xl"
        />
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <span className="eyebrow">Powered by Smashboard</span>
            <h2 id="waitlist-band" className="mt-1 font-display text-[clamp(24px,4vw,36px)] font-extrabold leading-tight">
              Like following {t.name} like this?
            </h2>
            <p className="mt-2 text-[15px] text-muted">
              Player accounts, entering tournaments online and the organizer desk open to the waitlist first. Get in early.
            </p>
          </div>
          <WaitlistButton size="lg" from="home-band" />
        </div>
      </section>
    </div>
  );
}
