import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import type { Match } from '@/engine/types';

import { useNow } from '@/hooks/useNow';
import { usePersistentState } from '@/hooks/usePersistentState';
import { cn } from '@/lib/cn';
import { fmtAgo, fmtElapsed } from '@/lib/format';

import { useLookup } from '@/data/lookup';
import { useStore } from '@/data/store';

import { matchContext } from '@/components/match/matchInfo';
import { fmtDuration, matchDuration } from '@/components/match/matchTiming';
import { ScoreForm } from '@/components/match/ScoreEntry';
import { NotFound } from '@/components/NotFound';
import { LiveDot, Pill } from '@/components/tournament/Badges';
import { EventFilter } from '@/components/tournament/EventFilter';
import { byEvent, type EventFilterValue } from '@/components/tournament/filterByEvent';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Tabs';

import { useAdmin } from '@/features/admin/adminContext';

type Q = 'court' | 'ready' | 'done';

/** Live scoring (design screen 5): pick a match, type the slip, confirm. */
export function Scores() {
  const { tid, matchId } = useParams();
  const lk = useLookup();
  const t = lk.tournament(tid);
  const now = useNow(15000);
  const nav = useNavigate();
  const { openScore } = useAdmin();
  const undo = useStore((s) => s.undo);
  const updates = useStore((s) => s.updates);
  const [q, setQ] = usePersistentState<Q>(tid ? `scores.tab:${tid}` : null, 'court');
  // shared with the Courts page: pick MS once and both screens follow
  const [evFilter, setEvFilter] = usePersistentState<EventFilterValue>(tid ? `events.filter:${tid}` : null, 'all');
  const [num, setNum] = useState('');
  const [isWide, setIsWide] = useState(() => window.matchMedia?.('(min-width: 1024px)').matches ?? true);

  useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 1024px)');
    if (!mq) return;
    const on = () => setIsWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const all = useMemo(() => (t ? lk.matchesOf(t.id).filter((m) => m.number > 0 && m.status !== 'bye') : []), [lk, t]);
  const events = t ? lk.eventsOf(t.id) : [];
  const shown: EventFilterValue = evFilter === 'all' || events.some((e) => e.id === evFilter) ? evFilter : 'all';
  const mine = byEvent(all, shown);
  const lists: Record<Q, Match[]> = {
    court: mine.filter((m) => m.status === 'on_court').sort((a, b) => (a.calledAt ?? 0) - (b.calledAt ?? 0)),
    ready: mine.filter((m) => m.status === 'ready').sort((a, b) => a.number - b.number),
    done: mine.filter((m) => m.status === 'finished').sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0)),
  };
  const [selected, setSelected] = useState<string | null>(() => matchId ?? lists.court[0]?.id ?? null);
  useEffect(() => {
    if (matchId) setSelected(matchId);
  }, [matchId]);
  if (!t) return <NotFound what="tournament" />;

  const pick = (m: Match) => {
    if (isWide) {
      setSelected(m.id);
      if (matchId) nav(`/admin/t/${t.id}/scores`, { replace: true });
    } else openScore(m.id);
  };
  const jump = () => {
    const m = all.find((x) => String(x.number) === num.trim().replace(/^#/, ''));
    if (m) {
      pick(m);
      setNum('');
    }
  };
  const sel = selected ? lk.match(selected) : undefined;
  const recent = lists.done.slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t.name}
        title="Live scoring"
        description="Players bring you their score slip. Type it in, and the draw and public page update instantly."
        actions={
          <ButtonLink to={`/t/${t.slug}`} icon={<LiveDot className="text-live" />}>
            Public page is live
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_300px]">
        <section className="flex min-w-0 flex-col gap-3" aria-label="Match queue">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              jump();
            }}
          >
            <label className="relative flex min-w-0 flex-1 items-center">
              <span className="num pointer-events-none absolute left-4 text-[15px] font-semibold text-muted">#</span>
              <span className="sr-only">Match number from the slip</span>
              <input
                value={num}
                onChange={(e) => setNum(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder="Match number on the slip"
                className="num min-h-11 w-full rounded-full border border-line bg-surface pl-8 pr-4 text-[15px] outline-none placeholder:font-sans placeholder:text-faint focus:border-info focus:ring-[3px] focus:ring-info/20"
              />
            </label>
            <Button type="submit" variant="ink" disabled={!num}>
              Open
            </Button>
          </form>
          <EventFilter
            events={events}
            value={shown}
            onChange={setEvFilter}
            countOf={(id) => byEvent(all, id).filter((m) => m.status === 'on_court').length}
          />
          <Segmented
            label="Queue"
            value={q}
            onChange={setQ}
            stretch
            options={[
              { value: 'court', label: 'On court', count: lists.court.length },
              { value: 'ready', label: 'Ready', count: lists.ready.length },
              { value: 'done', label: 'Done', count: lists.done.length },
            ]}
          />
          <div className="flex flex-col gap-2">
            {lists[q].slice(0, 30).map((m) => {
              const c = matchContext(lk, m);
              const on = isWide && selected === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(m)}
                  className={cn(
                    'flex w-full flex-col gap-1.5 rounded-2xl border-[1.5px] bg-surface p-3.5 text-left transition-colors',
                    on ? 'border-fg shadow-[inset_0_0_0_1px_rgb(var(--fg))]' : 'border-line hover:border-muted',
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="num text-[12px] font-semibold">
                      #{m.number} · {c.ev.kind} · {c.short}
                    </span>
                    {m.status === 'on_court' ? (
                      <Pill tone="live">
                        <LiveDot /> {lk.courtName(t.id, m.courtId)}
                      </Pill>
                    ) : m.status === 'finished' ? (
                      <Pill tone="ok">Final</Pill>
                    ) : (
                      <Pill tone="info">Ready</Pill>
                    )}
                  </span>
                  <span
                    className={cn(
                      'truncate text-[14px] font-semibold',
                      m.winner === 'a' && 'underline decoration-primary decoration-[3px] underline-offset-4',
                    )}
                  >
                    {lk.entryName(m.a)}
                  </span>
                  <span
                    className={cn(
                      'truncate text-[14px] font-semibold',
                      m.winner === 'b' && 'underline decoration-primary decoration-[3px] underline-offset-4',
                    )}
                  >
                    {lk.entryName(m.b)}
                  </span>
                  <span className="text-[12px] text-muted">
                    {m.status === 'on_court'
                      ? m.startedAt
                        ? `Playing ${fmtDuration(now - m.startedAt)}`
                        : `Warming up ${fmtElapsed(m.calledAt ?? now, now)}`
                      : m.status === 'finished'
                        ? m.games.map(([a, b]) => `${a}-${b}`).join(', ') || 'Walkover'
                        : 'Waiting for a court'}
                  </span>
                </button>
              );
            })}
            {lists[q].length === 0 && (
              <p className="rounded-2xl border border-dashed border-line p-4 text-[14px] text-muted">
                {q === 'court' ? 'No matches on court right now.' : q === 'ready' ? 'No matches waiting.' : 'No results yet.'}
              </p>
            )}
          </div>
        </section>

        <section className="panel hidden min-w-0 p-4 sm:p-5 lg:block" aria-label="Score entry">
          {sel ? (
            <ScoreForm
              key={sel.id}
              matchId={sel.id}
              embedded
              onDone={() => {
                const next = lists.court.find((m) => m.id !== sel.id);
                setSelected(next?.id ?? null);
              }}
            />
          ) : (
            <Empty icon="whistle" title="Pick a match" body="Choose a match on the left, or type the match number from the slip." />
          )}
        </section>

        <aside className="panel hidden min-w-0 flex-col gap-1 p-5 2xl:flex" aria-label="Recently entered">
          <h2 className="mb-2 font-display text-[20px] font-bold">Recently entered</h2>
          {recent.map((m) => {
            const w = m.winner;
            const l = w === 'a' ? 'b' : 'a';
            const last = [...updates]
              .reverse()
              .find((u) => u.matchId === m.id && (u.label === 'Result saved' || u.label === 'Result edited'));
            return (
              <div key={m.id} className="flex flex-col gap-1 border-b border-line py-3 last:border-0">
                <span className="num text-[12px] text-muted">
                  {m.finishedAt ? fmtAgo(m.finishedAt, now) : ''} · {lk.event(m.eventId)?.kind} · #{m.number}
                  {matchDuration(m) !== undefined && ` · ${fmtDuration(matchDuration(m)!)}`}
                </span>
                {w && (
                  <span className="text-[14px]">
                    <strong>{lk.entryName(m[w])}</strong> <span className="text-muted">def.</span> {lk.entryName(m[l])}
                  </span>
                )}
                <span className="flex items-center justify-between gap-2">
                  <span className="num text-[13px] font-semibold">
                    {m.result === 'walkover' ? 'W/O' : m.games.map(([a, b]) => (w === 'a' ? `${a}-${b}` : `${b}-${a}`)).join(' ')}
                  </span>
                  <span className="flex gap-1">
                    {last && (
                      <button
                        className="min-h-9 rounded-full px-2.5 text-[12.5px] font-semibold text-muted hover:bg-sunken hover:text-fg touch:min-h-11"
                        onClick={() => undo(last.id)}
                      >
                        Undo
                      </button>
                    )}
                    <Button size="sm" onClick={() => setSelected(m.id)}>
                      Edit
                    </Button>
                  </span>
                </span>
              </div>
            );
          })}
          <p className="mt-2 flex items-start gap-2 text-[12.5px] text-muted">
            <Icon name="info" size={16} className="mt-0.5 shrink-0" /> Every change is logged, so you can correct a slip later.
          </p>
        </aside>
      </div>
    </div>
  );
}
