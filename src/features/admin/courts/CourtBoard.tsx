import { type FormEvent, useState } from 'react';

import type { Court, Match, Tournament } from '@/engine/types';

import { useNow } from '@/hooks/useNow';
import { usePersistentState } from '@/hooks/usePersistentState';
import { cn } from '@/lib/cn';
import { fmtTime } from '@/lib/format';

import type { Lookup } from '@/data/lookup';
import type { CallConflict } from '@/data/ops';
import { useQueue, waitingFor } from '@/data/queries';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { averageDuration } from '@/components/match/matchTiming';
import { byEvent, type EventFilterValue } from '@/components/tournament/filterByEvent';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Tabs';

import { useAdmin } from '@/features/admin/adminContext';
import { ConflictDialog } from '@/features/admin/courts/ConflictDialog';
import { BusyCourt, FreeCourt } from '@/features/admin/courts/CourtTiles';
import { MiniRow, QueueRow, RecentRow } from '@/features/admin/courts/QueueRows';

/**
 * Match day on one screen: progress per event (also the event filter), every court with live
 * scores, and the call queue. Fill free courts in one tap, or drag / tap Call for a specific match.
 */
export function CourtBoard({ lk, t }: { lk: Lookup; t: Tournament }) {
  const now = useNow(10000);
  const queue = useQueue(lk, t, now);
  const callMatch = useStore((s) => s.callMatch);
  const fillCourts = useStore((s) => s.fillCourts);
  const { openScore } = useAdmin();
  // remembered per tournament, so switching pages or tabs keeps the desk where it was
  const [tab, setTab] = usePersistentState<'ready' | 'waiting' | 'recent'>(`courts.tab:${t.id}`, 'ready');
  const [evFilter, setEvFilter] = usePersistentState<EventFilterValue>(`events.filter:${t.id}`, 'all');
  const [dragging, setDragging] = useState<string | null>(null);
  const [picking, setPicking] = useState<Match | null>(null);
  const [blocked, setBlocked] = useState<{ matchId: string; courtId: string; conflict: CallConflict } | null>(null);
  const [slip, setSlip] = useState('');

  const events = lk.eventsOf(t.id).filter((e) => e.drawState === 'published');
  // events run in parallel on shared courts; the filter only narrows the lists
  const shown: EventFilterValue = evFilter === 'all' || events.some((e) => e.id === evFilter) ? evFilter : 'all';
  const matches = lk.matchesOf(t.id).filter((m) => m.status !== 'bye' && m.number > 0);
  const onCourt = (c: Court) => matches.find((m) => m.status === 'on_court' && m.courtId === c.id);
  const free = t.courts.filter((c) => !onCourt(c));
  const callable = queue.filter((q) => !q.blocked && !q.resting);
  const queueShown = shown === 'all' ? queue : queue.filter((q) => q.match.eventId === shown);
  const waiting = byEvent(matches, shown)
    .filter((m) => m.status === 'pending')
    .sort((a, b) => a.number - b.number);
  const recent = byEvent(matches, shown)
    .filter((m) => m.status === 'finished' && m.finishedAt)
    .sort((a, b) => b.finishedAt! - a.finishedAt!)
    .slice(0, 12);
  const suggested = queueShown.find((q) => !q.blocked && !q.resting) ?? queueShown.find((q) => !q.blocked);

  const done = matches.filter((m) => m.status === 'finished').length;
  const left = matches.length - done;
  const avg = averageDuration(matches) ?? 32 * 60000;
  const finishAt = now + Math.ceil(left / Math.max(1, t.courts.length)) * (avg + 4 * 60000);

  const call = (matchId: string, courtId: string, force?: { busy?: boolean; rest?: boolean }) => {
    const conflict = callMatch(matchId, courtId, force);
    setPicking(null);
    if (!conflict) {
      const m = lk.match(matchId)!;
      toast(`Match #${m.number} sent to ${lk.courtName(t.id, courtId)}`, {
        detail: `${lk.entryName(m.a)} and ${lk.entryName(m.b)} were notified.`,
      });
      setBlocked(null);
    } else if (conflict.busy.length || conflict.resting.length) setBlocked({ matchId, courtId, conflict });
  };

  const fill = () => {
    const n = fillCourts(t.id);
    if (n) toast(`${n} match${n === 1 ? '' : 'es'} sent to court`, { detail: 'Players were notified.' });
    else toast('Nobody is free to play yet', { tone: 'info', detail: 'Ready matches are waiting on busy or resting players.' });
  };

  const openSlip = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(slip.replace(/\D/g, ''));
    const m = matches.find((x) => x.number === n);
    if (!m) {
      toast(`No match #${slip.trim() || '?'} in ${t.name}`, { tone: 'error' });
      return;
    }
    if (m.status === 'pending') {
      toast(`Match #${n} can't be scored yet`, { tone: 'info', detail: waitingFor(lk, m) });
      return;
    }
    setSlip('');
    openScore(m.id);
  };

  const fillLabel = !free.length
    ? 'All courts busy'
    : !callable.length
      ? 'Nothing ready to call'
      : `Fill ${Math.min(free.length, callable.length)} free ${Math.min(free.length, callable.length) === 1 ? 'court' : 'courts'}`;

  return (
    <div className="flex flex-col gap-5">
      <section className="panel flex flex-col gap-4 p-4 sm:p-5" aria-label="Match day progress">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 text-[14px] text-muted">
              <span className="num font-display text-[26px] font-extrabold leading-none text-fg">{done}</span>
              <span>
                of <span className="num">{matches.length}</span> matches played
              </span>
            </div>
            <p className="mt-1 text-[13px] text-muted">
              <span className="num">{t.courts.length - free.length}</span>/<span className="num">{t.courts.length}</span> courts in use ·{' '}
              <span className="num">{queue.length}</span> ready to call
              {left > 0 && done > 0 && (
                <>
                  {' '}
                  · done around <span className="num">{fmtTime(finishAt)}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form onSubmit={openSlip} className="flex items-center gap-1.5" role="search" aria-label="Enter a score slip">
              <input
                value={slip}
                onChange={(e) => setSlip(e.target.value)}
                inputMode="numeric"
                placeholder="Slip #"
                aria-label="Match number on the score slip"
                className="num h-11 w-24 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-[14px] outline-none focus:border-fg sm:flex-none"
              />
              <Button type="submit" variant="ink" disabled={!slip.trim()}>
                Enter score
              </Button>
            </form>
            <Button
              variant="primary"
              className="w-full sm:w-auto"
              icon={<Icon name="whistle" size={18} />}
              disabled={!free.length || !callable.length}
              onClick={fill}
            >
              {fillLabel}
            </Button>
          </div>
        </div>

        <div
          role="group"
          aria-label="Show event"
          className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {[
            { id: 'all' as const, code: '', label: 'All events' },
            ...events.map((e) => ({ id: e.id, code: e.kind, label: e.name.replace(/^Open /, '') })),
          ].map((o) => {
            const ms = byEvent(matches, o.id);
            const played = ms.filter((m) => m.status === 'finished').length;
            const live = ms.filter((m) => m.status === 'on_court').length;
            const on = o.id === shown;
            const pct = ms.length ? Math.round((played / ms.length) * 100) : 0;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => setEvFilter(o.id)}
                className={cn(
                  'relative flex min-h-12 shrink-0 flex-col justify-center gap-1 overflow-hidden rounded-2xl border px-3.5 py-1.5 text-left transition-colors',
                  on ? 'border-fg bg-fg text-bg' : 'border-line bg-surface hover:border-fg/50',
                )}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                  {o.code && <span className={cn('num text-[11.5px]', on ? 'opacity-70' : 'text-muted')}>{o.code}</span>}
                  {o.label}
                  {live > 0 && (
                    <span className={cn('h-1.5 w-1.5 rounded-full', on ? 'bg-bg' : 'bg-live')} aria-label={`${live} on court`} />
                  )}
                </span>
                <span className={cn('num text-[11.5px]', on ? 'opacity-75' : 'text-muted')}>
                  {played}/{ms.length} played
                </span>
                <span className={cn('absolute inset-x-0 bottom-0 h-[3px]', on ? 'bg-bg/20' : 'bg-sunken')} aria-hidden>
                  <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="Courts" className="grid content-start gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
          {t.courts.map((c) => {
            const m = onCourt(c);
            return m ? (
              <BusyCourt key={c.id} lk={lk} court={c} m={m} now={now} />
            ) : (
              <FreeCourt
                key={c.id}
                lk={lk}
                court={c}
                suggested={suggested}
                dragging={!!dragging}
                onDrop={(mid) => call(mid, c.id)}
                now={now}
              />
            );
          })}
        </section>

        <aside
          className="panel flex min-h-[420px] flex-col overflow-hidden xl:sticky xl:top-24 xl:max-h-[calc(100dvh-120px)]"
          aria-label="Match queue"
        >
          <div className="border-b border-line p-3">
            <Segmented
              label="Queue"
              value={tab}
              onChange={setTab}
              stretch
              options={[
                { value: 'ready', label: 'Up next', count: queueShown.length },
                { value: 'waiting', label: 'Later', count: waiting.length },
                { value: 'recent', label: 'Done', count: recent.length },
              ]}
            />
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
            {tab === 'ready' &&
              (queueShown.length ? (
                <>
                  <p className="px-3 pb-2 pt-1 text-[13px] text-muted">In call order. Drag onto a free court, or tap Call.</p>
                  {queueShown.map((q) => (
                    <QueueRow
                      key={q.match.id}
                      lk={lk}
                      t={t}
                      q={q}
                      canCall={free.length > 0}
                      onCall={() => setPicking(q.match)}
                      onDrag={setDragging}
                    />
                  ))}
                </>
              ) : (
                <p className="p-4 text-[14px] text-muted">
                  {left === 0 ? 'Every match is played.' : 'No matches are ready. They appear as soon as both sides are known.'}
                </p>
              ))}
            {tab === 'waiting' && waiting.slice(0, 40).map((m) => <MiniRow key={m.id} lk={lk} m={m} sub={waitingFor(lk, m)} />)}
            {tab === 'recent' &&
              (recent.length ? (
                recent.map((m) => <RecentRow key={m.id} lk={lk} m={m} now={now} />)
              ) : (
                <p className="p-4 text-[14px] text-muted">Results show up here as you enter them.</p>
              ))}
          </div>
          <div className="border-t border-line p-2">
            <ButtonLink to={`/admin/t/${t.id}/slips`} variant="ghost" size="sm" className="w-full" icon={<Icon name="print" size={16} />}>
              Print score slips
            </ButtonLink>
          </div>
        </aside>
      </div>

      <ConflictDialog lk={lk} t={t} state={blocked} queue={queue} now={now} onClose={() => setBlocked(null)} onCall={call} />

      <Dialog
        open={!!picking}
        onClose={() => setPicking(null)}
        title={picking ? `Send #${picking.number} to a court` : ''}
        subtitle={picking ? `${lk.entryName(picking.a)} vs ${lk.entryName(picking.b)}` : undefined}
        size="sm"
      >
        {picking && (
          <div className="grid grid-cols-2 gap-2.5 pb-1">
            {free.map((c) => (
              <Button
                key={c.id}
                variant="secondary"
                size="lg"
                onClick={() => call(picking.id, c.id)}
                icon={<Icon name="location" size={18} />}
              >
                {c.name}
              </Button>
            ))}
            {free.length === 0 && <p className="col-span-2 text-[14px] text-muted">Every court is busy. Enter a result to free one up.</p>}
          </div>
        )}
      </Dialog>
    </div>
  );
}
