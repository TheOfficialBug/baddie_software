import type { ReactNode } from 'react';
import { Link } from 'react-router';

import type { Match, Side } from '@/engine/types';

import { cn } from '@/lib/cn';
import { fmtAgo, fmtElapsed } from '@/lib/format';

import type { Lookup } from '@/data/lookup';

import { useShowLevels } from '@/components/draw/showLevels';
import { DurationTag } from '@/components/match/Duration';
import { gamesFor, matchContext, sideName } from '@/components/match/matchInfo';
import { fmtDuration, matchDuration } from '@/components/match/matchTiming';
import { EventChip, FlightBadge, LevelTag, StatusPill } from '@/components/tournament/Badges';
import { Icon } from '@/components/ui/Icon';

const involves = (lk: Lookup, m: Match, pid?: string | null) => !!pid && [m.a, m.b].some((e) => lk.entry(e)?.playerIds.includes(pid));

/**
 * Compact bracket box (Challonge-style): two 24px rows with seed, name and game scores; the match
 * number sits in a narrow gutter that also shows the state (court when live, up next when ready).
 */
export function BracketMatch({
  lk,
  m,
  highlight,
  onOpen,
}: {
  lk: Lookup;
  m: Match;
  highlight?: string | null;
  onOpen?: (m: Match) => void;
}) {
  const isBye = m.status === 'bye';
  const showLevels = useShowLevels();
  const dim = !!highlight && !involves(lk, m, highlight);
  const tid = lk.event(m.eventId)!.tournamentId;
  const court = m.status === 'on_court' ? lk.courtName(tid, m.courtId) : '';
  const foot =
    m.status === 'on_court'
      ? `${court} · live`
      : m.status === 'finished'
        ? m.result === 'walkover'
          ? 'Walkover'
          : m.result === 'retired'
            ? 'Retired'
            : `Final${matchDuration(m) !== undefined ? ` · ${fmtDuration(matchDuration(m)!)}` : ''}`
        : isBye
          ? 'Bye'
          : m.status === 'ready'
            ? 'Up next'
            : m.loserTo
              ? `Waiting · loser → ${m.loserTo}`
              : 'Waiting';
  const Comp = onOpen && !isBye ? 'button' : 'div';
  return (
    <Comp
      type={Comp === 'button' ? 'button' : undefined}
      onClick={Comp === 'button' ? () => onOpen!(m) : undefined}
      title={`${m.number > 0 ? `#${m.number} · ` : ''}${foot}`}
      aria-label={Comp === 'button' ? `Match ${m.number}: ${sideName(lk, m, 'a')} vs ${sideName(lk, m, 'b')}, ${foot}` : undefined}
      className={cn(
        'relative flex w-full overflow-hidden rounded-md border bg-surface text-left transition-[opacity,border-color]',
        m.status === 'on_court' ? 'border-live' : 'border-line-strong/70',
        isBye && 'border-dashed bg-transparent',
        dim && 'opacity-30',
        Comp === 'button' && 'hover:border-fg/60',
      )}
    >
      <span
        className={cn(
          'num flex w-8 shrink-0 flex-col items-center justify-center gap-0.5 border-r text-[10.5px] font-semibold leading-none',
          m.status === 'on_court'
            ? 'border-live bg-live text-white'
            : m.status === 'ready'
              ? 'border-line bg-primary/30 text-fg'
              : 'border-line bg-sunken text-muted',
        )}
        aria-hidden
      >
        {m.number > 0 ? m.number : ''}
        {m.status === 'on_court' && <span className="text-[9.5px] font-bold">{court.replace(/^court\s*/i, 'C').slice(0, 4)}</span>}
      </span>
      <span className="relative min-w-0 flex-1">
        {(['a', 'b'] as Side[]).map((side, i) => {
          const slot = m[side];
          const entry = lk.entry(slot);
          const won = m.status === 'finished' && m.winner === side;
          const lost = m.status === 'finished' && !!m.winner && m.winner !== side;
          const mine = involves(lk, { ...m, a: side === 'a' ? m.a : null, b: side === 'b' ? m.b : null }, highlight);
          const sc = gamesFor(m, side);
          const other = gamesFor(m, side === 'a' ? 'b' : 'a');
          return (
            <span
              key={side}
              className={cn(
                'flex h-7 items-center gap-1 pl-2 text-[12.5px]',
                i > 0 && 'border-t border-line',
                won && 'font-bold',
                (lost || !slot || slot === 'BYE') && 'text-muted',
                mine && 'bg-primary/25',
              )}
            >
              <span className={cn('min-w-0 flex-1 truncate', (!slot || slot === 'BYE') && 'italic text-faint')}>
                {sideName(lk, m, side)}
                {entry?.seed ? <span className="num ml-1 text-[10px] font-semibold text-muted">[{entry.seed}]</span> : null}
              </span>
              {showLevels && <LevelTag levels={lk.entryLevels(slot)} className="mr-1" />}
              {sc.map((g, gi) => (
                <span
                  key={gi}
                  className={cn(
                    'num flex h-full w-6 shrink-0 items-center justify-center text-[12px] font-semibold',
                    m.status === 'on_court' && gi === sc.length - 1 && m.live
                      ? 'text-live'
                      : g > (other[gi] ?? -1)
                        ? 'bg-fg/[0.08] text-fg'
                        : 'text-muted',
                  )}
                >
                  {g}
                </span>
              ))}
            </span>
          );
        })}
        {/* the divider between the two sides reads as a versus */}
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-surface px-1 text-[8.5px] font-bold uppercase leading-[11px] tracking-wider text-muted"
          aria-hidden
        >
          vs
        </span>
      </span>
    </Comp>
  );
}

/** Full-width match card for lists (schedule, player pages, admin). */
export function MatchRow({
  lk,
  m,
  now,
  highlight,
  to,
  onClick,
  right,
  hideStatus,
}: {
  lk: Lookup;
  m: Match;
  now: number;
  highlight?: string | null;
  to?: string;
  onClick?: () => void;
  right?: ReactNode;
  hideStatus?: boolean;
}) {
  const ctx = matchContext(lk, m);
  const tid = ctx.ev.tournamentId;
  const body = (
    <>
      <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-muted">
        <span className="num font-semibold">#{m.number}</span>
        <EventChip kind={ctx.ev.kind} />
        {ctx.flight && <FlightBadge flight={ctx.flight} size="sm" />}
        <span className="min-w-0 truncate">{ctx.label}</span>
        <span className="ml-auto flex items-center gap-2">
          {m.status === 'on_court' && (
            <span className="num flex items-center gap-1 font-semibold text-live">
              <Icon name="location" size={14} />
              {lk.courtName(tid, m.courtId)} · {fmtElapsed(m.calledAt ?? now, now)}
            </span>
          )}
          {m.status === 'finished' && m.finishedAt && <span>{fmtAgo(m.finishedAt, now)}</span>}
          <DurationTag m={m} size="sm" />
          {!hideStatus && <StatusPill status={m.status} result={m.result} live={!!m.live && (m.live[0] > 0 || m.live[1] > 0)} />}
        </span>
      </div>
      <div className="mt-2 flex w-full items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {(['a', 'b'] as Side[]).map((side) => {
            const won = m.status === 'finished' && m.winner === side;
            const lost = m.status === 'finished' && !!m.winner && m.winner !== side;
            const sc = gamesFor(m, side);
            const other = gamesFor(m, side === 'a' ? 'b' : 'a');
            const mine = involves(lk, { ...m, a: side === 'a' ? m.a : null, b: side === 'b' ? m.b : null }, highlight);
            const slot = m[side];
            return (
              <div key={side} className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[15px]',
                    won ? 'font-bold' : 'font-medium',
                    (lost || !slot) && 'text-muted',
                    !slot && 'italic',
                    mine && 'rounded-md bg-primary/30 px-1',
                  )}
                >
                  {sideName(lk, m, side)}
                </span>
                {won && <Icon name="check" size={16} strokeWidth={2.4} className="text-ok" label="Winner" />}
                <span className="flex shrink-0 gap-1.5">
                  {sc.map((g, gi) => (
                    <span
                      key={gi}
                      className={cn(
                        'num w-6 text-right text-[14px] font-semibold',
                        m.status === 'on_court' && gi === sc.length - 1 && m.live
                          ? 'text-live'
                          : g > (other[gi] ?? -1)
                            ? 'text-fg'
                            : 'text-muted',
                      )}
                    >
                      {g}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
        {right}
      </div>
    </>
  );
  const cls = 'block w-full min-w-0 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left transition-colors';
  if (to)
    return (
      <Link to={to} className={cn(cls, 'hover:border-fg/40')}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(cls, 'hover:border-fg/40')}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

/** "Winner def. Loser   21-15 21-18" (design: latest results). */
export function ResultLine({ lk, m, now }: { lk: Lookup; m: Match; now: number }) {
  const ctx = matchContext(lk, m);
  if (!m.winner) return null;
  const l: Side = m.winner === 'a' ? 'b' : 'a';
  const score =
    m.result === 'walkover'
      ? 'W/O'
      : m.games.map((g) => (m.winner === 'a' ? `${g[0]}-${g[1]}` : `${g[1]}-${g[0]}`)).join('  ') + (m.result === 'retired' ? ' ret.' : '');
  return (
    <div className="flex flex-col gap-1 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-[15px]">
          <strong>{lk.entryName(m[m.winner])}</strong> <span className="text-muted">def.</span> {lk.entryName(m[l])}
        </span>
        <span className="num shrink-0 text-[13.5px] font-semibold">{score}</span>
      </div>
      <span className="text-[13px] text-muted">
        {ctx.ev.name} · {ctx.label} · {m.finishedAt ? fmtAgo(m.finishedAt, now) : ''}
        {matchDuration(m) !== undefined && ` · took ${fmtDuration(matchDuration(m)!)}`}
      </span>
    </div>
  );
}
