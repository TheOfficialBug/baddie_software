import type { ReactNode } from 'react';

import type { Court, Match, Side } from '@/engine/types';

import { cn } from '@/lib/cn';
import { fmtElapsed } from '@/lib/format';

import type { Lookup } from '@/data/lookup';

import { DurationTag } from '@/components/match/Duration';
import { matchContext } from '@/components/match/matchInfo';
import { LiveDot } from '@/components/tournament/Badges';
import { Icon } from '@/components/ui/Icon';

/**
 * Live court card (Smashboard design): court label, event · round chip, both sides with
 * finished games and the current game in a pill. The side that is ahead gets the lime pill.
 */
export function CourtCard({
  lk,
  court,
  match,
  now,
  size = 'md',
  footer,
  sideActions,
  className,
  freeAction,
  onStart,
}: {
  lk: Lookup;
  court: Court;
  match?: Match;
  now: number;
  size?: 'md' | 'lg';
  footer?: ReactNode;
  sideActions?: (side: Side) => ReactNode;
  className?: string;
  freeAction?: ReactNode;
  /** admin: start the match clock when players finish warming up */
  onStart?: () => void;
}) {
  const big = size === 'lg';
  if (!match) {
    return (
      <article
        className={cn('flex min-h-[176px] flex-col gap-3 rounded-2xl border-2 border-dashed border-line p-[18px]', className)}
        aria-label={`${court.name}, free`}
      >
        <div className="flex items-center justify-between">
          <span className={cn('eyebrow text-fg', big && 'text-[14px]')}>{court.name}</span>
          <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[12px] font-semibold text-muted">Free</span>
        </div>
        <div className="flex flex-1 items-center justify-center text-center">
          {freeAction ?? <span className="text-[14px] text-muted">Next match soon</span>}
        </div>
      </article>
    );
  }
  const ctx = matchContext(lk, match);
  const started = !!match.live && (match.live[0] > 0 || match.live[1] > 0 || match.games.length > 0);
  const cur = match.live ?? [0, 0];

  const row = (side: Side) => {
    const i = side === 'a' ? 0 : 1;
    const mine = cur[i];
    const other = cur[1 - i];
    const leading = started && mine > other;
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={cn('min-w-0 flex-1 truncate font-semibold', big ? 'text-[clamp(18px,1.6vw,24px)]' : 'text-[15px]')}>
          {lk.entryName(match[side])}
        </span>
        {match.games.map((g, gi) => (
          <span
            key={gi}
            className={cn(
              'num w-[26px] shrink-0 text-right',
              big ? 'text-[18px]' : 'text-[14px]',
              g[i] > g[1 - i] ? 'font-semibold text-fg' : 'text-muted',
            )}
          >
            {g[i]}
          </span>
        ))}
        <span
          key={`${mine}`}
          className={cn(
            'num grid shrink-0 animate-tick place-items-center rounded-[10px] font-semibold',
            big ? 'h-14 min-w-[64px] px-2 text-[30px]' : 'h-[38px] min-w-[44px] px-1.5 text-[20px]',
            leading ? 'bg-primary text-primary-fg' : 'bg-sunken text-fg',
          )}
        >
          {started ? mine : '–'}
        </span>
        {sideActions?.(side)}
      </div>
    );
  };

  return (
    <article
      className={cn('panel flex min-w-0 flex-col gap-3 p-[18px]', big && 'gap-4 p-6', className)}
      aria-label={`${court.name}: ${lk.entryName(match.a)} versus ${lk.entryName(match.b)}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn('eyebrow flex items-center gap-1.5 text-fg', big && 'text-[14px]')}>
          <Icon name="location" size={15} className="text-muted" />
          {court.name}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-live-soft px-2.5 py-0.5 text-[12px] font-semibold text-live">
          <LiveDot />
          {ctx.ev.kind} · {ctx.flight ? `${ctx.flight} · ` : ''}
          {ctx.short}
        </span>
      </div>
      <div className={cn('flex flex-col', big ? 'gap-3' : 'gap-2')}>
        {row('a')}
        {row('b')}
      </div>
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <span className="num">
          #{match.number} ·{' '}
          {match.startedAt
            ? started
              ? `Game ${match.games.length + 1}`
              : 'Playing'
            : `Warming up · called ${fmtElapsed(match.calledAt ?? now, now)} ago`}
        </span>
        {match.startedAt ? (
          <DurationTag m={match} />
        ) : onStart ? (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[12.5px] font-semibold text-fg hover:border-fg/60 touch:min-h-11"
          >
            <Icon name="timer" size={14} /> Start clock
          </button>
        ) : null}
      </div>
      {footer && <div className="-mx-[18px] -mb-[18px] border-t border-line px-3 py-2.5">{footer}</div>}
    </article>
  );
}
