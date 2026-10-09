import type { ReactNode } from 'react';

import type { QueueItem } from '@/engine/scheduler';
import type { Match, Tournament } from '@/engine/types';

import { fmtAgo } from '@/lib/format';

import { type Lookup } from '@/data/lookup';
import { useStore } from '@/data/store';

import { matchContext } from '@/components/match/matchInfo';
import { EventChip, FlightBadge, Pill } from '@/components/tournament/Badges';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

import { useAdmin } from '@/features/admin/adminContext';

export function MiniRow({ lk, m, sub, right }: { lk: Lookup; m: Match; sub?: string; right?: ReactNode }) {
  const c = matchContext(lk, m);
  return (
    <div className="flex items-start gap-3 rounded-2xl px-3 py-3 hover:bg-sunken">
      <span className="num w-10 shrink-0 pt-0.5 text-[15px] font-semibold text-muted">#{m.number}</span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5 text-[12.5px] text-muted">
          <EventChip kind={c.ev.kind} />
          {c.flight && <FlightBadge flight={c.flight} size="sm" />}
          <span className="truncate">{c.short}</span>
        </div>
        <div className="truncate text-[14px] font-semibold">{m.a && m.a !== 'BYE' ? lk.entryName(m.a) : 'To be decided'}</div>
        <div className="truncate text-[14px] font-semibold">{m.b && m.b !== 'BYE' ? lk.entryName(m.b) : 'To be decided'}</div>
        {sub && <div className="mt-0.5 text-[12.5px] text-muted">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function QueueRow({
  lk,
  t,
  q,
  canCall,
  onCall,
  onDrag,
}: {
  lk: Lookup;
  t: Tournament;
  q: QueueItem;
  canCall: boolean;
  onCall: () => void;
  onDrag: (id: string | null) => void;
}) {
  const { openScore } = useAdmin();
  const m = q.match;
  const c = matchContext(lk, m);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', m.id);
        e.dataTransfer.effectAllowed = 'move';
        onDrag(m.id);
      }}
      onDragEnd={() => onDrag(null)}
      className="group mb-1 rounded-2xl border-[1.5px] border-transparent px-3 py-3 transition-colors hover:border-line hover:bg-sunken/60 lg:cursor-grab lg:active:cursor-grabbing"
      aria-label={`Match ${m.number}, ${lk.entryName(m.a)} versus ${lk.entryName(m.b)}`}
    >
      <div className="flex items-start gap-2.5">
        <span className="num w-10 shrink-0 pt-0.5 text-[15px] font-semibold text-muted">#{m.number}</span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5 text-[12.5px] text-muted">
            <EventChip kind={c.ev.kind} />
            {c.flight && <FlightBadge flight={c.flight} size="sm" />}
            <span className="truncate">{c.short}</span>
          </div>
          <div className="truncate text-[14px] font-semibold">{lk.entryName(m.a)}</div>
          <div className="truncate text-[14px] font-semibold">{lk.entryName(m.b)}</div>
          {q.blocked && (
            <div className="mt-1 flex items-center gap-1 text-[12.5px] font-medium text-live">
              <Icon name="alert" size={14} /> Unavailable: {q.blocked}
            </div>
          )}
          {!q.blocked && q.resting && (
            <div className="mt-1 flex items-center gap-1 text-[12.5px] font-medium text-warn">
              <Icon name="timer" size={14} /> {q.resting.name} rests {q.resting.minutesLeft} more min
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button size="sm" variant={q.blocked || q.resting ? 'secondary' : 'primary'} disabled={!canCall} onClick={onCall}>
            Call
          </Button>
          <button
            className="min-h-9 rounded-full px-2.5 text-[12px] font-semibold text-muted hover:text-fg touch:min-h-11"
            onClick={() => openScore(m.id)}
          >
            Score
          </button>
        </div>
      </div>
      <span className="sr-only">{t.name}</span>
    </div>
  );
}

export function RecentRow({ lk, m, now }: { lk: Lookup; m: Match; now: number }) {
  const { openScore } = useAdmin();
  const updates = useStore((s) => s.updates);
  const undo = useStore((s) => s.undo);
  const last = [...updates].reverse().find((u) => u.matchId === m.id && (u.label === 'Result saved' || u.label === 'Result edited'));
  const w = m.winner ? lk.entryName(m[m.winner]) : '';
  return (
    <MiniRow
      lk={lk}
      m={m}
      sub={`${w} won · ${m.result === 'walkover' ? 'walkover' : m.games.map(([a, b]) => `${a}-${b}`).join(', ')} · ${m.finishedAt ? fmtAgo(m.finishedAt, now) : ''}`}
      right={
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button size="sm" onClick={() => openScore(m.id)}>
            Edit
          </Button>
          {last && (
            <button
              className="min-h-9 rounded-full px-2.5 text-[12px] font-semibold text-muted hover:text-fg touch:min-h-11"
              onClick={() => undo(last.id)}
            >
              Undo
            </button>
          )}
          <Pill tone="ok" className="hidden">
            Done
          </Pill>
        </div>
      }
    />
  );
}
