import { useEffect } from 'react';
import { Link, useParams } from 'react-router';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNow } from '@/hooks/useNow';
import { fmtTime } from '@/lib/format';
import { useThemePref } from '@/lib/theme';

import { useLookup } from '@/data/lookup';
import { useQueue } from '@/data/queries';

import { CourtCard } from '@/components/match/CourtCard';
import { matchContext } from '@/components/match/matchInfo';
import { NotFound } from '@/components/NotFound';
import { EventChip, FlightBadge, LiveDot, Pill } from '@/components/tournament/Badges';
import { IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ShuttleMark } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

/** Projector view for the hall. Dark by default unless the viewer picked a theme. */
export function TVMode() {
  const { slug } = useParams();
  const lk = useLookup();
  const t = lk.bySlug(slug);
  useDocumentTitle('TV', t?.name);
  const now = useNow(5000);
  const pref = useThemePref();
  const queue = useQueue(lk, t ?? lk.tournaments[0], now);

  useEffect(() => {
    if (pref !== 'system') return;
    const root = document.documentElement;
    const prev = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');
    return () => {
      if (prev) root.setAttribute('data-theme', prev);
      else root.removeAttribute('data-theme');
    };
  }, [pref]);

  if (!t) return <NotFound what="tournament" />;
  const matches = lk.matchesOf(t.id);
  const live = matches.filter((m) => m.status === 'on_court');
  const upNext = queue.slice(0, 8);

  return (
    <div className="flex min-h-dvh flex-col gap-6 bg-bg px-4 py-4 text-fg sm:px-6 sm:py-6 3xl:gap-8 3xl:px-10 3xl:py-8 short:gap-4 short:py-3">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link
          to={`/t/${t.slug}/courts`}
          aria-label="Leave TV mode"
          title="Leave TV mode"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-fg"
        >
          <Icon name="left" size={22} />
        </Link>
        <ShuttleMark size={44} className="hidden xs:inline-grid" />
        <div className="min-w-0 flex-1">
          <div className="eyebrow flex items-center gap-2">
            <span className="truncate">Live courts · {t.venue}</span>
          </div>
          <h1 className="truncate font-display text-[clamp(22px,3vw,44px)] font-extrabold leading-[1.05]">{t.name}</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {live.length > 0 && (
            <Pill tone="live" className="hidden sm:inline-flex">
              <LiveDot /> <span className="num">{live.length}</span> on court
            </Pill>
          )}
          <time className="num text-[clamp(22px,2.6vw,40px)] font-semibold leading-none" aria-label={`Time now ${fmtTime(now)}`}>
            {fmtTime(now)}
          </time>
          <ThemeToggle className="hidden lg:inline-flex" />
          <IconButton
            label="Full screen"
            onClick={() => {
              const root = document.documentElement;
              if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
              else root.requestFullscreen?.().catch(() => undefined);
            }}
          >
            <Icon name="fullscreen" size={22} />
          </IconButton>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-8 3xl:gap-10">
        <section aria-label="Courts">
          {t.courts.length === 0 ? (
            <p className="text-[18px] text-muted">No courts set up yet.</p>
          ) : (
            <div className="grid content-start gap-4 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 3xl:gap-6">
              {t.courts.map((c) => (
                <CourtCard
                  key={c.id}
                  lk={lk}
                  court={c}
                  now={now}
                  size="lg"
                  match={live.find((m) => m.courtId === c.id)}
                  freeAction={<span className="text-[16px] text-muted">Next match soon</span>}
                />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="tv-next" className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="eyebrow">Get ready</div>
              <h2 id="tv-next" className="font-display text-[clamp(24px,2.4vw,36px)] font-extrabold leading-tight">
                Up next
              </h2>
            </div>
            <p className="hidden text-[15px] text-muted sm:block">Players, please stay close to the courts.</p>
          </div>
          {upNext.length === 0 ? (
            <p className="panel p-5 text-[16px] text-muted">No matches waiting to be called.</p>
          ) : (
            <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 3xl:gap-4">
              {upNext.map((q, i) => {
                const ctx = matchContext(lk, q.match);
                return (
                  <li key={q.match.id} className="panel flex min-w-0 gap-3 p-4 3xl:p-5">
                    <span
                      className={
                        i === 0
                          ? 'num grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-[18px] font-semibold text-primary-fg'
                          : 'num grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunken text-[18px] font-semibold text-muted'
                      }
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                        <EventChip kind={ctx.ev.kind} />
                        {ctx.flight && <FlightBadge flight={ctx.flight} size="sm" />}
                        <span className="truncate">{ctx.label}</span>
                        <span className="num ml-auto shrink-0">#{q.match.number}</span>
                      </div>
                      <div className="truncate text-[clamp(16px,1.2vw,20px)] font-semibold">{lk.entryName(q.match.a)}</div>
                      <div className="truncate text-[clamp(16px,1.2vw,20px)] font-semibold">{lk.entryName(q.match.b)}</div>
                      {q.resting && (
                        <div className="mt-1 flex items-center gap-1 text-[13px] text-warn">
                          <Icon name="timer" size={15} /> Resting, <span className="num">{q.resting.minutesLeft}</span> min
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}
