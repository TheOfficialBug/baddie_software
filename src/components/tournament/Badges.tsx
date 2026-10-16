import type { ReactNode } from 'react';

import type { EventKind, FlightLabel, MatchStatus, ResultType, SkillLevel } from '@/engine/types';

import { cn } from '@/lib/cn';

import { EVENT_NAME } from '@/components/tournament/labels';
const EV_STYLE: Record<EventKind, string> = {
  MS: 'bg-ms/10 text-ms',
  WS: 'bg-ws/10 text-ws',
  MD: 'bg-md/10 text-md',
  WD: 'bg-wd/10 text-wd',
  XD: 'bg-xd/10 text-xd',
};

/** Event code chip (MS, WS…), monospaced like the design. */
export function EventChip({ kind, label, className }: { kind: EventKind; label?: string; className?: string }) {
  return (
    <span
      title={EVENT_NAME[kind]}
      className={cn('num inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11.5px] font-semibold', EV_STYLE[kind], className)}
    >
      {label ?? kind}
    </span>
  );
}

const FL: Record<FlightLabel, string> = {
  A: 'bg-fa/15 text-fa',
  B: 'bg-fb/15 text-fb',
  C: 'bg-fc/15 text-fc',
  D: 'bg-fd/15 text-fd',
};

export function FlightBadge({ flight, size = 'md', className }: { flight: FlightLabel; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold',
        FL[flight],
        size === 'sm' && 'h-5 w-5 text-[11px]',
        size === 'md' && 'h-7 w-7 text-[13px]',
        size === 'lg' && 'h-10 w-10 text-[18px]',
        className,
      )}
      role="img"
      aria-label={`${flight} flight`}
      title={`${flight} flight`}
    >
      {flight}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return <span className={cn('inline-block h-2 w-2 shrink-0 animate-pulse-dot rounded-full bg-current', className)} aria-hidden />;
}

type Tone = 'neutral' | 'live' | 'ok' | 'warn' | 'info' | 'lime' | 'muted' | 'accent' | 'hero';
export function Pill({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-sunken text-fg',
    muted: 'bg-sunken text-muted',
    live: 'bg-live-soft text-live',
    ok: 'bg-ok-soft text-ok',
    accent: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    info: 'bg-info-soft text-info',
    lime: 'bg-primary text-primary-fg',
    hero: 'bg-hero-line/15 text-hero-fg',
  };
  return (
    <span
      title={title}
      className={cn(
        'inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold leading-tight',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusPill({ status, result, live }: { status: MatchStatus; result?: ResultType; live?: boolean }) {
  if (status === 'on_court')
    return (
      <Pill tone="live">
        <LiveDot /> {live ? 'Live' : 'On court'}
      </Pill>
    );
  if (status === 'finished') {
    if (result === 'walkover') return <Pill tone="muted">Walkover</Pill>;
    if (result === 'retired') return <Pill tone="muted">Retired</Pill>;
    if (result === 'dq') return <Pill tone="muted">Disqualified</Pill>;
    return <Pill tone="ok">Final</Pill>;
  }
  if (status === 'ready') return <Pill tone="info">Up next</Pill>;
  if (status === 'bye') return <Pill tone="muted">Bye</Pill>;
  return <Pill tone="muted">Waiting</Pill>;
}

/** Skill level(s) of an entry for its event: "B", or "B/C" for a pair. */
export function LevelTag({ levels, className }: { levels: SkillLevel[]; className?: string }) {
  if (!levels.length) return null;
  return (
    <span
      className={cn('num ml-1.5 shrink-0 rounded bg-sunken px-1 text-[10px] font-bold leading-[15px] text-muted', className)}
      title={`Level ${levels.join(' / ')}`}
    >
      {levels.join('/')}
    </span>
  );
}

export function SeedTag({ seed }: { seed?: number }) {
  if (!seed) return null;
  return (
    <span className="num ml-1.5 shrink-0 text-[10.5px] font-semibold text-muted" title={`Seed ${seed}`}>
      [{seed}]
    </span>
  );
}
