// Checking players in at the venue: pure state changes, so the store and the tests share them.
import type { Entry, ID, Match } from '@/engine/types';

import type { CheckIn, DB } from '@/data/types';

/** Check players in (already checked-in players keep their original time) or out. */
export function setCheckedIn(db: DB, tournamentId: ID, playerIds: ID[], on: boolean, at: number, by?: ID): DB {
  const ids = new Set(playerIds);
  const others = db.checkIns.filter((c) => c.tournamentId !== tournamentId || !ids.has(c.playerId));
  if (!on) return others.length === db.checkIns.length ? db : { ...db, checkIns: others };
  const kept = db.checkIns.filter((c) => c.tournamentId === tournamentId && ids.has(c.playerId));
  const added: CheckIn[] = [...ids]
    .filter((p) => !kept.some((c) => c.playerId === p))
    .map((playerId) => ({ tournamentId, playerId, at, ...(by ? { by } : {}) }));
  return added.length ? { ...db, checkIns: [...db.checkIns, ...added] } : db;
}

/** Everyone back to not checked in, e.g. at the start of the next day. */
export function clearCheckIns(db: DB, tournamentId: ID): DB {
  return db.checkIns.some((c) => c.tournamentId === tournamentId)
    ? { ...db, checkIns: db.checkIns.filter((c) => c.tournamentId !== tournamentId) }
    : db;
}

/** Players in a match who haven't checked in yet, side A first. */
export function notCheckedIn(m: Pick<Match, 'a' | 'b'>, entries: Map<ID, Entry>, checkIns: Map<ID, CheckIn>): ID[] {
  return [m.a, m.b].flatMap((e) => (e && e !== 'BYE' ? (entries.get(e)?.playerIds ?? []) : [])).filter((p) => !checkIns.has(p));
}

/** Player id → check-in, for one tournament. */
export function checkInsOf(checkIns: CheckIn[], tournamentId: ID): Map<ID, CheckIn> {
  return new Map(checkIns.filter((c) => c.tournamentId === tournamentId).map((c) => [c.playerId, c]));
}
