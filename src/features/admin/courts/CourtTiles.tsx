import { useState } from 'react';

import type { QueueItem } from '@/engine/scheduler';
import type { Court, Match, Side } from '@/engine/types';

import { cn } from '@/lib/cn';

import { type Lookup } from '@/data/lookup';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { CourtCard } from '@/components/match/CourtCard';
import { Button, IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useConfirm } from '@/components/ui/useConfirm';

import { useAdmin } from '@/features/admin/adminContext';

export function FreeCourt({
  lk,
  court,
  suggested,
  dragging,
  onDrop,
  now,
}: {
  lk: Lookup;
  court: Court;
  suggested?: QueueItem;
  dragging: boolean;
  onDrop: (matchId: string) => void;
  now: number;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData('text/plain');
        if (id) onDrop(id);
      }}
      className={cn(
        'rounded-2xl transition-shadow',
        over && 'shadow-[0_0_0_3px_rgb(var(--primary))]',
        dragging && !over && 'shadow-[0_0_0_2px_rgb(var(--primary)/0.6)]',
      )}
    >
      <CourtCard
        lk={lk}
        court={court}
        now={now}
        className={cn('min-h-[160px]', over && 'border-primary bg-primary/10')}
        freeAction={
          dragging ? (
            <span className="text-[14px] font-semibold">Drop here to call</span>
          ) : suggested ? (
            <div className="flex w-full flex-col items-center gap-2.5">
              <span className="text-[12.5px] text-muted">Suggested next</span>
              <span className="max-w-full truncate text-[14px] font-semibold">
                #{suggested.match.number} · {lk.entryName(suggested.match.a)} v {lk.entryName(suggested.match.b)}
              </span>
              <Button size="sm" variant="primary" onClick={() => onDrop(suggested.match.id)}>
                Call #{suggested.match.number} here
              </Button>
            </div>
          ) : (
            <span className="text-[14px] text-muted">Nothing ready to call</span>
          )
        }
      />
    </div>
  );
}

export function BusyCourt({ lk, court, m, now }: { lk: Lookup; court: Court; m: Match; now: number }) {
  const adjust = useStore((s) => s.adjustLive);
  const setPoints = useStore((s) => s.setLivePoints);
  const back = useStore((s) => s.returnToQueue);
  const start = useStore((s) => s.startMatch);
  const setLiveScore = useStore((s) => s.setLiveScore);
  const { ask, dialog } = useConfirm();
  const scored = m.games.length > 0 || !!(m.live && (m.live[0] || m.live[1]));
  const { openScore } = useAdmin();
  const rules = lk.matchRules(m);
  let wa = 0;
  let wb = 0;
  m.games.forEach(([x, y]) => (x > y ? wa++ : wb++));
  const decided = Math.max(wa, wb) >= Math.ceil(rules.bestOf / 2);

  const sideActions = (side: Side) => (
    <div className="flex flex-col gap-1 touch:gap-2">
      <IconButton
        size="sm"
        label={`Point to ${lk.entryName(m[side])}`}
        onClick={() => adjust(m.id, side, 1)}
        className="h-9 w-9 border border-line bg-surface text-fg touch:h-11 touch:w-11"
      >
        <Icon name="plus" size={16} strokeWidth={2.2} />
      </IconButton>
      <button
        aria-label={`Take a point from ${lk.entryName(m[side])}`}
        onClick={() => adjust(m.id, side, -1)}
        className="grid h-7 w-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-fg touch:h-9 touch:w-11"
      >
        <Icon name="minus" size={14} />
      </button>
    </div>
  );

  return (
    <>
      <CourtCard
        lk={lk}
        court={court}
        match={m}
        now={now}
        sideActions={sideActions}
        onScoreInput={(side, points) => setPoints(m.id, side, points)}
        onStart={() => start(m.id)}
        footer={
          <div className="flex items-center gap-2">
            <Button size="sm" variant={decided ? 'primary' : 'ink'} className="flex-1" onClick={() => openScore(m.id)}>
              {decided ? 'Confirm result' : 'Enter score slip'}
            </Button>
            {scored && (
              <IconButton
                size="sm"
                label="Reset score"
                onClick={() =>
                  ask({
                    title: `Reset the score on ${court.name}?`,
                    body: `The live score of match #${m.number} goes back to 0–0. The match stays on court.`,
                    confirmLabel: 'Reset score',
                    danger: true,
                    onConfirm: () => {
                      setLiveScore(m.id, [], null);
                      toast(`Score on ${court.name} reset to 0–0`, { tone: 'info' });
                    },
                  })
                }
              >
                <Icon name="refresh" size={18} />
              </IconButton>
            )}
            <IconButton
              size="sm"
              label="Return to queue"
              onClick={() => {
                back(m.id);
                toast(`Match #${m.number} moved back to the queue`, { tone: 'info' });
              }}
            >
              <Icon name="undo" size={18} />
            </IconButton>
          </div>
        }
      />
      {dialog}
    </>
  );
}
