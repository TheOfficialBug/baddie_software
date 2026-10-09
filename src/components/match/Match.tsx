import type { ReactNode } from 'react';
import { Link } from 'react-router';

import type { Match, Side } from '@/engine/types';

import { cn } from '@/lib/cn';
import { fmtAgo, fmtElapsed } from '@/lib/format';

import type { Lookup } from '@/data/lookup';

import { DurationTag } from '@/components/match/Duration';
import { gamesFor, matchContext, sideName } from '@/components/match/matchInfo';
import { fmtDuration, matchDuration } from '@/components/match/matchTiming';
import { EventChip, FlightBadge, LiveDot, StatusPill } from '@/components/tournament/Badges';
import { Icon } from '@/components/ui/Icon';

const involves = (lk: Lookup, m: Match, pid?: string | null) => !!pid && [m.a, m.b].some((e) => lk.entry(e)?.playerIds.includes(pid));

/** Compact bracket card (design: .m / .side / .mfoot). */
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
  const dim = !!highlight && !involves(lk, m, highlight);
  const tid = lk.event(m.eventId)!.tournamentId;
  const foot =
    m.status === 'on_court'
      ? `${lk.courtName(tid, m.courtId)} · live`
      : m.status === 'finished'
        ? m.result === 'walkover'
          ? 'Walkover'
          : m.result === 'retired'
            ? 'Retired'
            : 'Final'
        : isBye
          ? 'Bye'
          : m.status === 'ready'
            ? 'Up next'
            : m.loserTo
              ? `Loser → ${m.loserTo}`
              : 'Waiting';
  const Comp = onOpen && !isBye ? 'button' : 'div';
  return (
    <Comp
      type={Comp === 'button' ? 'button' : undefined}
      onClick={Comp === 'button' ? () => onOpen!(m) : undefined}
      className={cn(
        'relative block w-full overflow-hidden rounded-xl border bg-surface text-left transition-[opacity,border-color]',
        m.status === 'on_court' ? 'border-live shadow-[0_0_0_1px_rgb(var(--live))]' : 'border-line',
        isBye && 'border-dashed bg-transparent',
        dim && 'opacity-30',
        Comp === 'button' && 'hover:border-fg/50',
      )}
    >
      {(['a', 'b'] as Side[]).map((side, i) => {
        const slot = m[side];
        const entry = lk.entry(slot);
        const won = m.status === 'finished' && m.winner === side;
        const lost = m.status === 'finished' && !!m.winner && m.winner !== side;
        const mine = involves(lk, { ...m, a: side === 'a' ? m.a : null, b: side === 'b' ? m.b : null }, highlight);
        const sc = gamesFor(m, side);
        const other = gamesFor(m, side === 'a' ? 'b' : 'a');
        return (
          <div
            key={side}
            className={cn(
              'flex min-h-8 items-center gap-2 px-2.5 py-1.5 text-[13px]',
              i > 0 && 'border-t border-line',
              won && 'font-bold',
              (lost || !slot || slot === 'BYE') && 'text-muted',
              mine && 'bg-primary/25',
            )}
          >
            <span className="num w-[18px] shrink-0 text-[10px] font-semibold text-muted">{entry?.seed ?? ''}</span>
            <span className={cn('min-w-0 flex-1 truncate', (!slot || slot === 'BYE') && 'italic')}>{sideName(lk, m, side)}</span>
            {sc.map((g, gi) => (
              <span
                key={gi}
                className={cn(
                  'num w-6 shrink-0 text-right text-[13px] font-semibold',
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
          </div>
        );
      })}
      <div className="flex items-center gap-1.5 bg-sunken px-2.5 py-1 text-[11px] font-semibold text-muted">
        {m.status === 'on_court' && <LiveDot className="text-live" />}
        {m.number > 0 && <span className="num">#{m.number}</span>}
        <span className={cn('truncate', m.status === 'on_court' && 'text-live')}>{foot}</span>
        {m.status === 'finished' && matchDuration(m) !== undefined && (
          <span className="num ml-auto shrink-0">{fmtDuration(matchDuration(m)!)}</span>
        )}
      </div>
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
  const cls = 'block w-full rounded-2xl border border-line bg-surface px-4 py-3.5 text-left transition-colors';
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
