import { type ReactNode, useEffect, useRef, useState } from 'react';

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
  onScoreInput,
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
  /** admin: type a side's points into the score box (returns an error message, or null when saved) */
  onScoreInput?: (side: Side, points: number) => string | null;
}) {
  const big = size === 'lg';
  if (!match) {
    return (
      <article
        className={cn('flex min-h-[150px] flex-col gap-2.5 rounded-2xl border-2 border-dashed border-line p-3.5', className)}
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
        {onScoreInput ? (
          <ScoreBox
            value={started ? mine : null}
            label={`Points for ${lk.entryName(match[side])}`}
            className={cn(
              big ? 'h-14 w-[64px] text-[30px]' : 'h-[38px] w-[48px] text-[20px]',
              leading ? 'bg-primary text-primary-fg' : 'bg-sunken text-fg',
            )}
            onCommit={(points) => onScoreInput(side, points)}
          />
        ) : (
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
        )}
        {sideActions?.(side)}
      </div>
    );
  };

  return (
    <article
      className={cn('panel flex min-w-0 flex-col gap-2.5 p-3.5', big && 'gap-4 p-6', className)}
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

/**
 * The current-game score as an input: tap, type the points, Enter (or tap away) to save, Esc to cancel.
 * Shows the reason when a score isn't possible (e.g. 23-20) and puts the old value back.
 */
function ScoreBox({
  value,
  label,
  className,
  onCommit,
}: {
  value: number | null;
  label: string;
  className?: string;
  onCommit: (points: number) => string | null;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  // follow + / − taps and updates from other screens while not typing
  useEffect(() => {
    if (!editing) setText(value === null ? '' : String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const clean = text.trim();
    if (cancelled.current || clean === '' || Number(clean) === (value ?? 0)) {
      cancelled.current = false;
      setText(value === null ? '' : String(value));
      return;
    }
    const err = onCommit(Number(clean));
    setError(err);
    if (err) setText(value === null ? '' : String(value));
  };

  return (
    <span className="relative shrink-0">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        aria-label={label}
        aria-invalid={!!error || undefined}
        value={text}
        placeholder="–"
        onFocus={(e) => {
          setEditing(true);
          setError(null);
          e.target.select();
        }}
        onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        className={cn(
          'input-big num rounded-[10px] text-center font-semibold outline-none transition-shadow placeholder:text-current placeholder:opacity-60 focus:ring-[3px] focus:ring-primary/40',
          error && 'ring-2 ring-live',
          className,
        )}
      />
      {error && (
        <span
          role="alert"
          className="absolute right-0 top-full z-10 mt-1 w-max max-w-[220px] rounded-lg bg-live px-2 py-1 text-[12px] font-medium text-white shadow-pop"
        >
          {error}
        </span>
      )}
    </span>
  );
}
