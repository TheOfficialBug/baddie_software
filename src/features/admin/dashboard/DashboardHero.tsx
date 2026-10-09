import type { Match, TEvent, Tournament } from '@/engine/types';

import { fmtDateRange } from '@/lib/format';

import type { Lookup } from '@/data/lookup';

import { LiveDot, Pill } from '@/components/tournament/Badges';
import { ButtonLink } from '@/components/ui/Button';

interface HeroProps {
  lk: Lookup;
  t: Tournament;
  base: string;
  events: TEvent[];
  matches: Match[];
  done: number;
  onCourt: Match[];
  openScore: (matchId: string) => void;
}

/** Tournament banner: status, progress, main actions and live court tiles. */
export function DashboardHero({ lk, t, base, events, matches, done, onCourt, openScore }: HeroProps) {
  return (
    <section className="hero flex flex-wrap gap-7 rounded-3xl p-5 sm:p-7" aria-label={t.name}>
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-3.5">
        <div className="flex flex-wrap gap-2">
          {t.status === 'live' && (
            <Pill tone="live">
              <LiveDot /> Live now
            </Pill>
          )}
          {t.status === 'registration' && <Pill tone="lime">Registration open</Pill>}
          {t.status === 'completed' && <Pill tone="hero">Completed</Pill>}
          <Pill tone="hero">{t.courts.length} courts</Pill>
          <Pill tone="hero">{events.length} events</Pill>
        </div>
        <h2 className="font-display text-[clamp(26px,3.6vw,36px)] font-extrabold leading-[1.05]">{t.name}</h2>
        <p className="text-hero-muted">
          {t.venue}, {t.city} · {fmtDateRange(t.startDate, t.endDate)} · Scoring {lk.rules(events[0]?.id ?? '').short}
        </p>
        {matches.length > 0 && (
          <div className="flex max-w-[460px] flex-col gap-2">
            <div className="flex justify-between text-[13px] font-semibold">
              <span>Matches complete</span>
              <span className="num">
                {done} / {matches.length}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-hero-line/15">
              <div className="h-full rounded-full bg-primary" style={{ width: `${matches.length ? (done / matches.length) * 100 : 0}%` }} />
            </div>
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-2.5">
          <ButtonLink
            to={`${base}/scores`}
            variant="primary"
            iconRight={
              onCourt.length ? (
                <span className="num rounded-full bg-primary-fg px-2 text-[12px] text-primary">{onCourt.length}</span>
              ) : undefined
            }
          >
            Enter score slips
          </ButtonLink>
          <ButtonLink to={`${base}/courts`} variant="onHero">
            Manage courts
          </ButtonLink>
        </div>
      </div>
      {t.status === 'live' && <HeroCourts lk={lk} t={t} onCourt={onCourt} openScore={openScore} />}
    </section>
  );
}

function HeroCourts({ lk, t, onCourt, openScore }: Pick<HeroProps, 'lk' | 't' | 'onCourt' | 'openScore'>) {
  return (
    <div className="hidden min-w-0 flex-[1_1_340px] grid-cols-2 gap-2.5 sm:grid">
      {t.courts.slice(0, 6).map((c) => {
        const m = onCourt.find((x) => x.courtId === c.id);
        return (
          <button
            key={c.id}
            onClick={() => (m ? openScore(m.id) : undefined)}
            disabled={!m}
            className="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-hero-line/[0.07] p-3.5 text-left transition-colors enabled:hover:bg-hero-line/[0.12] disabled:cursor-default"
          >
            <span className="flex items-center justify-between text-[12px] font-semibold uppercase tracking-wider text-hero-muted">
              {c.name}
              {m && <span className="num normal-case">{lk.event(m.eventId)?.kind}</span>}
            </span>
            {m ? (
              (['a', 'b'] as const).map((s, i) => (
                <span key={s} className="flex justify-between gap-2 text-[13.5px] font-semibold">
                  <span className="truncate">{lk.entryName(m[s])}</span>
                  <span className="num shrink-0">
                    {[...m.games.map((g) => g[i]), ...(m.live && (m.live[0] || m.live[1]) ? [m.live[i]] : [])].join(' · ') || '–'}
                  </span>
                </span>
              ))
            ) : (
              <span className="text-[13.5px] text-hero-muted">Free</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
