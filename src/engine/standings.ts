// Group ranking per BWF GCR 16.2:
//  1. matches won
//  2. two tied → head-to-head
//  3. three+ tied → game difference (then head-to-head if two remain)
//  4. → point difference (then head-to-head if two remain)
//  5. → drawing lots (only once the group is complete)
import { hashString, mulberry32, shuffle } from './rng';
import { checkGame, gamesToWin, type ScoringRules } from './rules';
import type { ID, Match } from './types';

export type TieNote = 'Head-to-head' | 'Game difference' | 'Point difference' | 'Drawn by lot' | 'Level';

export interface StandingRow {
  entryId: ID;
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  pointsWon: number;
  pointsLost: number;
  rank: number;
  /** why this row is ordered where it is relative to rows on the same number of wins */
  note?: TieNote;
}

export interface Standings {
  rows: StandingRow[];
  complete: boolean;
}

export function computeStandings(groupId: ID, entryIds: ID[], matches: Match[], rules: ScoringRules): Standings {
  const rows = new Map<ID, StandingRow>(
    entryIds.map((id) => [
      id,
      { entryId: id, played: 0, won: 0, lost: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0, rank: 0 },
    ]),
  );
  const h2h = new Map<string, ID>(); // "x|y" → winner id
  const done = matches.filter((m) => m.status === 'finished' && m.winner && m.a && m.b && m.a !== 'BYE' && m.b !== 'BYE');

  for (const m of done) {
    const a = rows.get(m.a as ID);
    const b = rows.get(m.b as ID);
    if (!a || !b) continue;
    const winner = m.winner === 'a' ? a : b;
    const loser = m.winner === 'a' ? b : a;
    a.played++;
    b.played++;
    winner.won++;
    loser.lost++;
    h2h.set(key(a.entryId, b.entryId), winner.entryId);

    if (m.result === 'walkover') {
      // Counted as a straight-games win to pointsToWin-0 (common local convention).
      const g = gamesToWin(rules);
      winner.gamesWon += g;
      loser.gamesLost += g;
      winner.pointsWon += g * rules.pointsToWin;
      loser.pointsLost += g * rules.pointsToWin;
      continue;
    }
    for (const [x, y] of m.games) {
      a.pointsWon += x;
      a.pointsLost += y;
      b.pointsWon += y;
      b.pointsLost += x;
      const c = checkGame([x, y], rules);
      if (c.complete) {
        if (c.winner === 'a') {
          a.gamesWon++;
          b.gamesLost++;
        } else {
          b.gamesWon++;
          a.gamesLost++;
        }
      }
    }
  }

  const all = [...rows.values()];
  const complete = matches.length > 0 && matches.every((m) => m.status === 'finished' || m.status === 'bye');
  const rand = mulberry32(hashString(groupId));

  const gd = (r: StandingRow) => r.gamesWon - r.gamesLost;
  const pd = (r: StandingRow) => r.pointsWon - r.pointsLost;
  const criteria: [TieNote, (r: StandingRow) => number][] = [
    ['Game difference', gd],
    ['Point difference', pd],
  ];

  const rankSet = (set: StandingRow[], step: number): StandingRow[] => {
    if (set.length <= 1) return set;
    if (set.length === 2) {
      const w = h2h.get(key(set[0].entryId, set[1].entryId));
      if (w) {
        const ordered = w === set[0].entryId ? set : [set[1], set[0]];
        ordered.forEach((r) => (r.note = 'Head-to-head'));
        return ordered;
      }
    }
    if (step >= criteria.length) {
      if (complete) {
        set.forEach((r) => (r.note = 'Drawn by lot'));
        return shuffle(set, rand);
      }
      set.forEach((r) => (r.note = 'Level'));
      return set;
    }
    const [label, f] = criteria[step];
    const parts = partition(set, f);
    if (parts.length > 1) set.forEach((r) => (r.note = label));
    return parts.flatMap((p) => rankSet(p, step + 1));
  };

  const ranked = partition(all, (r) => r.won).flatMap((p) => rankSet(p, 0));
  ranked.forEach((r, i) => (r.rank = i + 1));
  return { rows: ranked, complete };
}

const key = (x: ID, y: ID) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/** Split rows into groups of equal value, highest value first. */
function partition(rows: StandingRow[], f: (r: StandingRow) => number): StandingRow[][] {
  const by = new Map<number, StandingRow[]>();
  for (const r of rows) {
    const v = f(r);
    by.set(v, [...(by.get(v) ?? []), r]);
  }
  return [...by.entries()].sort((p, q) => q[0] - p[0]).map(([, v]) => v);
}
