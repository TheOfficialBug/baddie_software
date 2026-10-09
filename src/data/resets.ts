// Putting things back: one match, one event's results, a whole tournament's results or its draws.
// Pure functions on the data snapshot; the desk asks for confirmation before calling them.
import { blockingDependents } from '@/engine/progression';
import type { ID, Match } from '@/engine/types';

import { clearDraw, type OpResult, resolveTournament, tournamentOfEvent } from '@/data/ops';
import type { DB } from '@/data/types';

/** A match as if it had never been called or played (who plays it is worked out again). */
const unplayed = (m: Match): Match =>
  m.status === 'bye'
    ? m
    : {
        ...m,
        status: 'pending',
        games: [],
        live: null,
        result: undefined,
        winner: undefined,
        courtId: undefined,
        calledAt: undefined,
        startedAt: undefined,
        finishedAt: undefined,
      };

const played = (m: Match) => m.status === 'finished' || m.status === 'on_court' || m.games.length > 0;

/** How many matches of these events have a result or are on court (what a reset would wipe). */
export function playedCount(db: DB, eventIds: ID[]): number {
  const ids = new Set(eventIds);
  return db.matches.filter((m) => ids.has(m.eventId) && played(m)).length;
}

/** One match back to not played. Refused while a match that depends on its result has started. */
export function resetMatch(db: DB, matchId: ID): OpResult {
  const m = db.matches.find((x) => x.id === matchId);
  if (!m) return { error: 'Match not found.' };
  if (!played(m)) return { error: 'This match has no score to reset.' };
  const blocking = blockingDependents(m.id, db.matches);
  if (blocking.length) return { error: `Match #${blocking[0].number} already depends on this result. Reset that one first.` };
  const t = tournamentOfEvent(db, m.eventId)!;
  return { db: resolveTournament({ ...db, matches: db.matches.map((x) => (x.id === m.id ? unplayed(x) : x)) }, t.id) };
}

/** Every match of the given events back to not played; the draws stay. */
function clearResults(db: DB, eventIds: Set<ID>, tournamentId: ID): DB {
  const matchIds = new Set(db.matches.filter((m) => eventIds.has(m.eventId)).map((m) => m.id));
  const next: DB = {
    ...db,
    matches: db.matches.map((m) => (eventIds.has(m.eventId) ? unplayed(m) : m)),
    // their undo history no longer applies
    updates: db.updates.filter((u) => !matchIds.has(u.matchId)),
  };
  return resolveTournament(next, tournamentId);
}

/** One event's results cleared, its draw kept. */
export function resetEventResults(db: DB, eventId: ID): DB {
  const t = tournamentOfEvent(db, eventId);
  return t ? clearResults(db, new Set([eventId]), t.id) : db;
}

/** One event's draw removed, with any results (entries stay). */
export function resetEventDraw(db: DB, eventId: ID): DB {
  const ids = new Set(db.matches.filter((m) => m.eventId === eventId).map((m) => m.id));
  const next = clearDraw(db, eventId);
  return { ...next, updates: next.updates.filter((u) => !ids.has(u.matchId)) };
}

/** Every result in a tournament cleared; draws stay. Match day starts over from the draws stage. */
export function resetTournamentResults(db: DB, tournamentId: ID): DB {
  const evIds = new Set(db.events.filter((e) => e.tournamentId === tournamentId).map((e) => e.id));
  const next = clearResults(db, evIds, tournamentId);
  return {
    ...next,
    tournaments: next.tournaments.map((t) =>
      t.id === tournamentId && (t.status === 'live' || t.status === 'completed') ? { ...t, status: 'closed' } : t,
    ),
  };
}

/** Back to open registration: every draw and result removed, entries kept, match numbers restart. */
export function resetTournamentDraws(db: DB, tournamentId: ID): DB {
  const evIds = db.events.filter((e) => e.tournamentId === tournamentId).map((e) => e.id);
  const next = evIds.reduce(resetEventDraw, db);
  return {
    ...next,
    tournaments: next.tournaments.map((t) => (t.id === tournamentId ? { ...t, status: 'registration', nextMatchNumber: 1 } : t)),
  };
}
