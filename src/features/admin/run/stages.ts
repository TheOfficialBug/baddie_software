// The four stages the organizer moves a tournament through, and where each tournament status sits.
import type { TEvent, Tournament } from '@/engine/types';

import type { Lookup } from '@/data/lookup';

export const STAGES = [
  { key: 'registration', label: 'Registration', icon: 'userAdd' },
  { key: 'draws', label: 'Draws', icon: 'draws' },
  { key: 'play', label: 'Match day', icon: 'whistle' },
  { key: 'done', label: 'Finished', icon: 'trophy' },
] as const;

export type StageIndex = 0 | 1 | 2 | 3;

/** Draft and open registration are both the registration stage. */
export function stageOf(status: Tournament['status']): StageIndex {
  if (status === 'closed') return 1;
  if (status === 'live') return 2;
  if (status === 'completed') return 3;
  return 0;
}

/** Counts every stage view needs, worked out once per render. */
export function tournamentProgress(lk: Lookup, t: Tournament) {
  const events = lk.eventsOf(t.id);
  const entries = events.flatMap((e) => lk.entriesOf(e.id));
  const accepted = (evId: string) => lk.entriesOf(evId).filter((e) => e.status === 'accepted').length;
  const drawn = events.filter((e) => e.drawState === 'published');
  const undrawn = events.filter((e) => e.drawState !== 'published');
  const matches = lk.matchesOf(t.id).filter((m) => m.status !== 'bye' && m.number > 0);
  const played = matches.filter((m) => m.status === 'finished').length;
  return {
    events,
    accepted: entries.filter((e) => e.status === 'accepted').length,
    pending: entries.filter((e) => e.status === 'pending'),
    drawn,
    undrawn,
    /** Undrawn events with enough confirmed entries to draw. */
    drawable: undrawn.filter((e) => accepted(e.id) >= 2),
    matches: matches.length,
    played,
    left: matches.length - played,
  };
}

export type Progress = ReturnType<typeof tournamentProgress>;

/** The draw format in words, e.g. "Drop flight A/B/C/D". */
export const formatName = (ev: TEvent) =>
  ev.mode === 'drop_flight'
    ? `Drop flight ${ev.config.variant === 'ABCD' ? 'A/B/C/D' : 'A/B'}`
    : ev.mode === 'round_robin'
      ? 'Round robin'
      : 'Knockout';
