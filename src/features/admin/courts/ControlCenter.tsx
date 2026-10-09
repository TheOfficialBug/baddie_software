import { useState } from 'react';
import { useParams } from 'react-router';

import { STORAGE_KEYS } from '@/config/app';
import type { Court, Match } from '@/engine/types';

import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/cn';
import { safeStorage } from '@/lib/storage';

import { useLookup } from '@/data/lookup';
import type { CallConflict } from '@/data/ops';
import { waitingFor } from '@/data/queries';
import { useQueue } from '@/data/queries';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { NotFound } from '@/components/NotFound';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Empty } from '@/components/ui/Empty';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Tabs';

import { ConflictDialog } from '@/features/admin/courts/ConflictDialog';
import { BusyCourt, FreeCourt } from '@/features/admin/courts/CourtTiles';
import { MiniRow, QueueRow, RecentRow } from '@/features/admin/courts/QueueRows';

const TIP_KEY = STORAGE_KEYS.courtsTipHidden;

/** Courts: who is on which court, what's ready to call, and quick live scoring. */
export function ControlCenter() {
  const { tid } = useParams();
  const lk = useLookup();
  const t = lk.tournament(tid);
  const now = useNow(10000);
  const queue = useQueue(lk, t ?? lk.tournaments[0], now);
  const callMatch = useStore((s) => s.callMatch);
  const [tab, setTab] = useState<'ready' | 'waiting' | 'recent'>('ready');
  const [dragging, setDragging] = useState<string | null>(null);
  const [picking, setPicking] = useState<Match | null>(null);
  const [tipHidden, setTipHidden] = useState(() => safeStorage.get(TIP_KEY) === '1');
  const [blocked, setBlocked] = useState<{ matchId: string; courtId: string; conflict: CallConflict } | null>(null);

  if (!t) return <NotFound what="tournament" />;
  const matches = lk.matchesOf(t.id).filter((m) => m.status !== 'bye');
  const onCourt = (c: Court) => matches.find((m) => m.status === 'on_court' && m.courtId === c.id);
  const free = t.courts.filter((c) => !onCourt(c));
  const waiting = matches.filter((m) => m.status === 'pending' && m.number > 0).sort((a, b) => a.number - b.number);
  const recent = matches
    .filter((m) => m.status === 'finished' && m.finishedAt)
    .sort((a, b) => b.finishedAt! - a.finishedAt!)
    .slice(0, 12);
  const suggested = queue.find((q) => !q.blocked && !q.resting) ?? queue.find((q) => !q.blocked);
  const hasDraws = lk.eventsOf(t.id).some((e) => e.drawState === 'published');

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

  if (!hasDraws)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow={t.name} title="Courts" />
        <Empty
          icon="draws"
          title="No draws published yet"
          body="Once a draw is published, matches show up here, ready to send to courts."
          action={
            <ButtonLink to={`/admin/t/${t.id}/draws`} variant="primary">
              Make the draws
            </ButtonLink>
          }
        />
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t.name}
        title="Courts"
        description={`${t.courts.length - free.length} of ${t.courts.length} courts in use · ${queue.length} matches ready to call`}
        actions={
          <ButtonLink to={`/admin/t/${t.id}/slips`} icon={<Icon name="print" size={17} />}>
            Print slips
          </ButtonLink>
        }
      />

      {!tipHidden && (
        <section
          className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5 sm:flex-row sm:items-center"
          aria-label="How match day works"
        >
          <ol className="grid flex-1 gap-3 sm:grid-cols-3">
            {[
              { icon: 'whistle' as const, title: 'Send to a court', body: 'Drag a ready match onto a free court, or tap Call.' },
              { icon: 'print' as const, title: 'Players play', body: 'They get a notification and fill in the paper slip.' },
              { icon: 'check' as const, title: 'Enter the score', body: 'Winners move on and the court frees up.' },
            ].map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span
                  className={cn(
                    'grid h-10 w-10 shrink-0 place-items-center rounded-full',
                    i === 0 ? 'bg-primary text-primary-fg' : 'bg-sunken',
                  )}
                >
                  <Icon name={s.icon} size={19} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">
                    {i + 1}. {s.title}
                  </span>
                  <span className="block text-[13px] text-muted">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              safeStorage.set(TIP_KEY, '1');
              setTipHidden(true);
            }}
          >
            Got it
          </Button>
        </section>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
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
                { value: 'ready', label: 'Ready', count: queue.length },
                { value: 'waiting', label: 'Waiting', count: waiting.length },
                { value: 'recent', label: 'Done', count: recent.length },
              ]}
            />
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
            {tab === 'ready' &&
              (queue.length ? (
                <>
                  <p className="px-3 pb-2 pt-1 text-[13px] text-muted">In call order. Drag onto a free court, or tap Call.</p>
                  {queue.map((q) => (
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
                <p className="p-4 text-[14px] text-muted">No matches are ready. They appear as soon as both players are known.</p>
              ))}
            {tab === 'waiting' && waiting.slice(0, 40).map((m) => <MiniRow key={m.id} lk={lk} m={m} sub={waitingFor(lk, m)} />)}
            {tab === 'recent' && recent.map((m) => <RecentRow key={m.id} lk={lk} m={m} now={now} />)}
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
