import { useEffect, useState } from 'react';

import type { Match } from '@/engine/types';

import { cn } from '@/lib/cn';

import { fmtDuration, matchDuration } from '@/components/match/matchTiming';
import { Icon } from '@/components/ui/Icon';

/** Ticks every second while mounted. */
function useSecondTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/**
 * Duration tag.
 * On court and started: a live mm:ss clock. Finished: total length ("34 min").
 * Called but not started: nothing (the court card says "Warming up").
 */
export function DurationTag({ m, className, size = 'md' }: { m: Match; className?: string; size?: 'sm' | 'md' }) {
  const live = m.status === 'on_court' && !!m.startedAt;
  const now = useSecondTick(live);
  const d = matchDuration(m, now);
  if (d === undefined) return null;
  return (
    <span
      className={cn(
        'num inline-flex shrink-0 items-center gap-1 rounded-full font-semibold',
        size === 'sm' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-[12px]',
        live ? 'bg-live-soft text-live' : 'bg-sunken text-muted',
        className,
      )}
      title={live ? 'Time since play started' : 'Match duration (start of play to result)'}
    >
      <Icon name="timer" size={size === 'sm' ? 12 : 14} />
      {live ? fmtDuration(d, true) : fmtDuration(d)}
    </span>
  );
}
