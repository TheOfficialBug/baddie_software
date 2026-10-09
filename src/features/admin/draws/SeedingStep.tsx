import { useState } from 'react';

import type { EventConfig, ID } from '@/engine/types';

import { cn } from '@/lib/cn';

import type { Lookup } from '@/data/lookup';

import { Button, IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

import { StepHead } from '@/features/admin/draws/StepHead';

/** Step 3: reorder entries (drag or arrows); the top `seeds` rows are seeded. */
export function SeedingStep({
  lk,
  order,
  onOrderChange,
  seeds,
  pairing,
  levelOf,
}: {
  lk: Lookup;
  order: ID[];
  onOrderChange: (order: ID[]) => void;
  seeds: number;
  pairing: EventConfig['pairing'];
  levelOf: (id: ID) => number;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = order.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onOrderChange(next);
  };

  return (
    <section aria-labelledby="db-seeding" className="min-w-0">
      <StepHead
        n={3}
        id="db-seeding"
        title="Check the seeding order"
        action={
          <Button
            size="sm"
            variant="ghost"
            icon={<Icon name="sparkles" size={16} />}
            onClick={() => onOrderChange(order.slice().sort((a, b) => levelOf(b) - levelOf(a)))}
          >
            Sort by level
          </Button>
        }
      />
      <p className="mb-3 text-[14px] text-muted">
        Drag a row, or use the arrows. The top <span className="num font-semibold text-fg">{seeds}</span> are seeded;{' '}
        {(pairing ?? 'balanced') === 'random'
          ? 'everyone else is drawn at random.'
          : 'everyone else is ranked by skill level (ties drawn by lot).'}
      </p>
      <ol className="panel scroll-thin flex max-h-[480px] flex-col gap-1 overflow-y-auto p-2">
        {order.map((id, i) => {
          const seeded = i < seeds;
          return (
            <li
              key={id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIdx(i);
              }}
              onDragEnd={() => {
                setDragIdx(null);
                setOverIdx(null);
              }}
              onDrop={() => {
                if (dragIdx !== null) move(dragIdx, i);
                setDragIdx(null);
                setOverIdx(null);
              }}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-xl py-1 pl-1.5 pr-1',
                seeded ? 'bg-sunken' : 'bg-surface',
                dragIdx === i && 'opacity-40',
                overIdx === i && dragIdx !== null && dragIdx !== i && 'ring-2 ring-info',
                i === seeds - 1 && i < order.length - 1 && 'mb-2',
              )}
            >
              <span className="grid h-10 w-6 shrink-0 cursor-grab place-items-center text-faint active:cursor-grabbing" aria-hidden>
                <Icon name="drag" size={18} />
              </span>
              <span
                className={cn(
                  'num grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold',
                  seeded ? 'bg-fg text-bg' : 'text-faint',
                )}
              >
                {seeded ? i + 1 : '·'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{lk.entryName(id)}</span>
              <span className="hidden shrink-0 text-[12px] text-faint xs:inline" title="Playing level">
                {lk
                  .playersOfEntry(id)
                  .map((p) => p.level)
                  .join('/')}
              </span>
              <IconButton
                label={`Move ${lk.entryName(id)} up`}
                size="sm"
                className="h-10 w-10"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                <Icon name="up" size={18} />
              </IconButton>
              <IconButton
                label={`Move ${lk.entryName(id)} down`}
                size="sm"
                className="h-10 w-10"
                disabled={i === order.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <Icon name="down" size={18} />
              </IconButton>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
