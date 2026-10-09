// How long matches take: from the start of play to the result.
import type { Match } from '@/engine/types';

/** Match length in ms: start of play → result saved. Undefined if never started (e.g. walkovers). */
export function matchDuration(m: Match, now = Date.now()): number | undefined {
  if (!m.startedAt) return undefined;
  if (m.status === 'finished') return m.finishedAt ? Math.max(0, m.finishedAt - m.startedAt) : undefined;
  if (m.status === 'on_court') return Math.max(0, now - m.startedAt);
  return undefined;
}

export function fmtDuration(ms: number, clock = false): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (clock) return h ? `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${min}:${String(sec).padStart(2, '0')}`;
  if (h) return `${h} h ${min} min`;
  return `${Math.max(1, Math.round(ms / 60000))} min`;
}

/** Average length of finished matches (for estimates). */
export function averageDuration(matches: Match[]): number | undefined {
  const ds = matches
    .map((m) => (m.status === 'finished' ? matchDuration(m) : undefined))
    .filter((x): x is number => x !== undefined && x > 0);
  if (!ds.length) return undefined;
  return ds.reduce((a, b) => a + b, 0) / ds.length;
}
