import type { ID, Slot } from '@/engine/types';

import { cn } from '@/lib/cn';

import type { Lookup } from '@/data/lookup';
import type { CheckIn } from '@/data/types';

import { Icon } from '@/components/ui/Icon';

/** Green tick for a checked-in player, an amber hollow circle for one who hasn't arrived yet. */
export function CheckInMark({ checkedIn, size = 15, className }: { checkedIn: boolean; size?: number; className?: string }) {
  return checkedIn ? (
    <Icon name="success" size={size} strokeWidth={2.2} className={cn('shrink-0 text-ok', className)} label="Checked in" />
  ) : (
    <span
      role="img"
      aria-label="Not checked in"
      title="Not checked in"
      className={cn('inline-block shrink-0 rounded-full border-2 border-warn', className)}
      style={{ width: size - 2, height: size - 2 }}
    />
  );
}

/** A player's name with their check-in mark; names of players still to arrive are muted. */
export function CheckInName({ name, checkedIn, className }: { name: string; checkedIn: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', !checkedIn && 'text-muted', className)}>
      <CheckInMark checkedIn={checkedIn} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * An entry's names ("A / B" for doubles). With `checkIns`, each player gets a check-in mark;
 * without it (check-in not in use yet) the names are plain text.
 */
export function EntryNames({
  lk,
  entry,
  checkIns,
  className,
}: {
  lk: Lookup;
  entry: Slot | undefined;
  checkIns?: Map<ID, CheckIn>;
  className?: string;
}) {
  const players = lk.playersOfEntry(entry ?? undefined);
  if (!checkIns || !players.length) return <span className={cn('truncate', className)}>{lk.entryName(entry ?? undefined)}</span>;
  const pending = entry && entry !== 'BYE' ? lk.entry(entry)?.pendingPartner : undefined;
  return (
    <span className={cn('flex min-w-0 items-center gap-x-1.5', className)}>
      {players.map((p, i) => (
        <span key={p.id} className="inline-flex min-w-0 items-center gap-1.5">
          {i > 0 && <span className="text-faint">/</span>}
          <CheckInName name={p.name} checkedIn={checkIns.has(p.id)} />
        </span>
      ))}
      {pending && (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-muted">
          <span className="text-faint">/</span>
          <span className="truncate">{pending.name}</span>
        </span>
      )}
    </span>
  );
}
