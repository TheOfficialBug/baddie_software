// Filling free courts in one go: the desk's "Fill free courts" button and the simulator share it.
import { fairShareTurns } from '@/engine/scheduler';
import type { ID } from '@/engine/types';

import { callToCourt, courtCallNotice } from '@/data/ops';
import type { DB } from '@/data/types';

export interface Assignment {
  matchId: ID;
  courtId: ID;
}

/**
 * Send the next ready matches to every free court of a tournament, in call order (events take
 * turns, then match number). Players on another court are never called; resting players are
 * skipped unless `ignoreRest` is set. Each call posts the same notice as a manual call.
 */
export function fillFreeCourts(
  db: DB,
  tournamentId: ID,
  now: number,
  opts: { ignoreRest?: boolean } = {},
): { db: DB; called: Assignment[] } {
  const t = db.tournaments.find((x) => x.id === tournamentId);
  if (!t) return { db, called: [] };
  const evIds = new Set(db.events.filter((e) => e.tournamentId === tournamentId).map((e) => e.id));
  const called: Assignment[] = [];
  for (const court of t.courts) {
    if (db.matches.some((m) => m.status === 'on_court' && m.courtId === court.id)) continue;
    const mine = db.matches.filter((m) => evIds.has(m.eventId));
    const turn = fairShareTurns(mine);
    const ready = mine.filter((m) => m.status === 'ready').sort((a, b) => turn(a) - turn(b) || a.number - b.number);
    for (const m of ready) {
      const r = callToCourt(db, m.id, court.id, now, { rest: opts.ignoreRest });
      if (!r.db) continue;
      const notice = courtCallNotice(r.db, m.id, court.id, now);
      db = notice ? { ...r.db, notices: [...r.db.notices, notice] } : r.db;
      called.push({ matchId: m.id, courtId: court.id });
      break;
    }
  }
  return { db, called };
}
