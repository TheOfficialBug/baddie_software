import { Link } from 'react-router';

import { roundName } from '@/engine/draws';
import type { Match, Stage, TEvent, Tournament } from '@/engine/types';

import { fmtDate } from '@/lib/format';

import type { Lookup } from '@/data/lookup';

import { EventChip, LiveDot } from '@/components/tournament/Badges';
import { Icon } from '@/components/ui/Icon';
import { ProgressBar } from '@/components/ui/ProgressBar';

const played = (m: Match) => m.number > 0 && m.status === 'finished';
const counts = (m: Match) => m.number > 0 && m.status !== 'bye';

/** Where a flight stands: its champion once the final is in, else the earliest round still being played. */
function flightNow(lk: Lookup, st: Stage, ms: Match[]): { text: string; done: boolean; live: boolean } {
  const mine = ms.filter((m) => m.stageId === st.id);
  // a placement round only sorts players into flights: it has no champion
  const final = st.placement ? undefined : mine.find((m) => m.round === st.rounds);
  if (final?.status === 'finished' && final.winner) return { text: lk.entryName(final[final.winner] as string), done: true, live: false };
  const open = mine.filter((m) => counts(m) && m.status !== 'finished').sort((a, b) => a.round - b.round)[0];
  if (!open) return { text: mine.some(counts) ? 'Waiting' : 'No matches', done: false, live: false };
  return { text: roundName(st, open.round), done: false, live: mine.some((m) => m.status === 'on_court') };
}

/** What is happening right now: how far the tournament has got, overall and in each event's flights. */
export function TournamentProgress({ t, lk }: { t: Tournament; lk: Lookup }) {
  const events = lk.eventsOf(t.id);
  const all = lk.matchesOf(t.id);
  const total = all.filter(counts).length;
  const done = all.filter(played).length;
  const onCourt = all.filter((m) => m.status === 'on_court').length;
  const ready = all.filter((m) => m.status === 'ready').length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <section className="panel flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="progress-title">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 id="progress-title" className="font-display text-[20px] font-bold">
            Tournament progress
          </h2>
          <p className="text-[14px] text-muted">
            {t.status === 'completed'
              ? 'All done. Final results below.'
              : t.status === 'live'
                ? `${onCourt} on court now · ${ready} ready to call`
                : `Draws are out. Play starts ${fmtDate(t.startDate, { weekday: 'long', month: 'long', day: 'numeric' })}.`}
          </p>
        </div>
        <div className="text-right">
          <span className="num font-display text-[30px] font-extrabold leading-none">{pct}%</span>
          <div className="num text-[13px] text-muted">
            {done} of {total} matches played
          </div>
        </div>
      </div>
      <ProgressBar value={done} max={total || 1} tone="ink" className="h-2" />

      <ul className="flex flex-col divide-y divide-line">
        {events.map((ev: TEvent) => {
          const ms = lk.matchesOfEvent(ev.id);
          const evTotal = ms.filter(counts).length;
          const evDone = ms.filter(played).length;
          const stages = lk.stagesOf(ev.id).sort((a, b) => a.order - b.order);
          return (
            <li key={ev.id}>
              <Link to={`/t/${t.slug}/draws/${ev.id}`} className="group flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                <span className="flex min-w-0 items-center gap-2.5 sm:w-52">
                  <EventChip kind={ev.kind} />
                  <span className="truncate font-semibold group-hover:underline">{ev.name}</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {stages.map((st) => {
                    const now = flightNow(lk, st, ms);
                    return (
                      <span
                        key={st.id}
                        className={
                          now.done
                            ? 'inline-flex max-w-full items-center gap-1 rounded-full bg-ok-soft px-2.5 py-1 text-[12.5px] font-semibold text-ok'
                            : 'inline-flex max-w-full items-center gap-1 rounded-full bg-sunken px-2.5 py-1 text-[12.5px] font-semibold'
                        }
                      >
                        <span className="text-muted">{st.flight ?? st.name}</span>
                        {now.done && <Icon name="trophy" size={13} />}
                        {now.live && <LiveDot />}
                        <span className="truncate">{now.text}</span>
                      </span>
                    );
                  })}
                </span>
                <span className="flex items-center gap-2 sm:w-40">
                  <ProgressBar value={evDone} max={evTotal || 1} tone="ink" className="h-1.5 flex-1" />
                  <span className="num w-14 text-right text-[12.5px] text-muted">
                    {evDone}/{evTotal}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
