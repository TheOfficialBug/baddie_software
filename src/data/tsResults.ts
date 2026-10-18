// Results played on tournamentsoftware.com, put into our draws (made from the same first round, see ./tsDraws).
// A result is placed by who played whom, not by round labels: the match in that event where those two
// entries meet. Results are applied over and over until nothing more fits, since each one decides who
// meets in the next round (and who drops to a plate). Scores are kept as played, without re-checking them
// against the event's scoring (the site mixes one game to 30 and best of 3 to 21 on the same day).
import type { EventKind, GameScore, ID, Side } from '@/engine/types';

import { norm } from '@/data/entryList';
import { resolveTournament } from '@/data/ops';
import type { DB } from '@/data/types';

export interface TsResult {
  kind: EventKind;
  /** Players' names on each side, as on the site. */
  sides: [string[], string[]];
  /** The side that won (0 or 1). */
  winner: 0 | 1;
  /** Points per game, side 0 first. */
  games: [number, number][];
  walkover?: boolean;
}

export interface TsResultsReport {
  db: DB;
  applied: number;
  /** Results whose two sides never met in our draws (or were already played differently). */
  unmatched: TsResult[];
}

const teamKey = (names: string[]) => names.map(norm).sort().join(' + ');

export function applyTsResults(db: DB, tournamentId: ID, results: TsResult[], now = Date.now()): TsResultsReport {
  const events = db.events.filter((e) => e.tournamentId === tournamentId);
  const evOf = new Map(events.map((e) => [e.kind, e.id]));
  const nameOf = new Map(db.players.map((p) => [p.id, p.name]));
  const keyOfEntry = new Map(db.entries.map((e) => [e.id, teamKey(e.playerIds.map((p) => nameOf.get(p) ?? ''))]));
  let todo = [...results];
  let applied = 0;

  for (let progress = true; progress && todo.length;) {
    progress = false;
    const left: TsResult[] = [];
    for (const r of todo) {
      const evId = evOf.get(r.kind);
      const keys = r.sides.map(teamKey);
      const m = db.matches.find(
        (x) =>
          x.eventId === evId &&
          x.status !== 'finished' &&
          x.status !== 'bye' &&
          typeof x.a === 'string' &&
          typeof x.b === 'string' &&
          x.a !== 'BYE' &&
          x.b !== 'BYE' &&
          [keyOfEntry.get(x.a), keyOfEntry.get(x.b)].sort().join(' | ') === [...keys].sort().join(' | '),
      );
      if (!m) {
        left.push(r);
        continue;
      }
      // our side a is the site's side 0 or 1
      const aIs0 = keyOfEntry.get(m.a as ID) === keys[0];
      const winner: Side = (r.winner === 0) === aIs0 ? 'a' : 'b';
      const games: GameScore[] = r.games.map(([x, y]) => (aIs0 ? [x, y] : [y, x]));
      db = {
        ...db,
        matches: db.matches.map((x) =>
          x.id === m.id
            ? {
                ...x,
                status: 'finished',
                winner,
                games: r.walkover ? [] : games,
                result: r.walkover ? 'walkover' : 'normal',
                live: null,
                // the site doesn't say when it was played or for how long: no call/start time, so no made-up
                // durations and no rest clock running from the import
                calledAt: undefined,
                startedAt: undefined,
                courtId: undefined,
                finishedAt: now,
              }
            : x,
        ),
      };
      db = resolveTournament(db, tournamentId);
      applied++;
      progress = true;
    }
    todo = left;
  }
  return { db, applied, unmatched: todo };
}
