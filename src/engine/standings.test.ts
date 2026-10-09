import { describe, expect, it } from 'vitest';

import { checkMatch, parseQuickScore, RULES } from './rules';
import { computeStandings, type StandingRow } from './standings';
import type { ID, Match, ResultType, Side } from './types';

// ---------------------------------------------------------------------------
// helpers: build finished group matches from short score strings
// ---------------------------------------------------------------------------

const R = RULES.BWF_3x21;
let seq = 0;

function base(a: ID, b: ID, groupId: string): Match {
  seq++;
  return {
    id: `m${seq}`,
    eventId: 'ev',
    stageId: 'ev-groups',
    groupId,
    number: seq,
    round: 1,
    index: seq,
    srcA: { kind: 'entry', entryId: a },
    srcB: { kind: 'entry', entryId: b },
    a,
    b,
    status: 'finished',
    games: [],
    live: null,
  };
}

/** `m('A', 'B', '21-15 18-21 21-19')`: a finished match, scores from A's side; the winner follows from the scores. */
function m(a: ID, b: ID, scores: string, groupId = 'g1'): Match {
  const games = parseQuickScore(scores);
  const check = checkMatch(games, R);
  if (!check.ok) throw new Error(`bad fixture ${a}-${b} ${scores}: ${check.errors.join(' ')}`);
  return { ...base(a, b, groupId), games, result: 'normal', winner: check.winner };
}

function special(a: ID, b: ID, result: ResultType, winner: Side, groupId = 'g1'): Match {
  return { ...base(a, b, groupId), result, winner };
}

function unplayed(a: ID, b: ID, groupId = 'g1'): Match {
  return { ...base(a, b, groupId), status: 'ready' };
}

const order = (rows: StandingRow[]) => rows.map((r) => r.entryId);
const notes = (rows: StandingRow[]) => Object.fromEntries(rows.map((r) => [r.entryId, r.note]));
const row = (rows: StandingRow[], id: ID) => rows.find((r) => r.entryId === id)!;

// ---------------------------------------------------------------------------
// GCR 16.2
// ---------------------------------------------------------------------------

describe('computeStandings (GCR 16.2)', () => {
  it('orders by matches won and tallies games and points', () => {
    const { rows, complete } = computeStandings(
      'g1',
      ['D', 'C', 'B', 'A'],
      [
        m('A', 'B', '21-10 21-10'),
        m('A', 'C', '21-10 21-10'),
        m('A', 'D', '21-10 21-10'),
        m('B', 'C', '21-15 15-21 21-15'),
        m('B', 'D', '21-10 21-10'),
        m('C', 'D', '21-10 21-10'),
      ],
      R,
    );
    expect(complete).toBe(true);
    expect(order(rows)).toEqual(['A', 'B', 'C', 'D']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(rows.every((r) => r.note === undefined)).toBe(true);
    expect(row(rows, 'B')).toMatchObject({
      played: 3,
      won: 2,
      lost: 1,
      gamesWon: 4,
      gamesLost: 3,
      pointsWon: 20 + 57 + 42,
      pointsLost: 42 + 51 + 20,
    });
  });

  it('two tied on wins → head-to-head, even against a better game difference', () => {
    // A and B both win 2; B beat A. C and D both win 1; D beat C.
    const { rows } = computeStandings(
      'g1',
      ['A', 'B', 'C', 'D'],
      [
        m('A', 'C', '21-0 21-0'),
        m('A', 'D', '21-0 21-0'),
        m('B', 'A', '21-19 19-21 22-20'),
        m('B', 'D', '21-19 21-19'),
        m('C', 'B', '21-0 21-0'),
        m('D', 'C', '21-19 19-21 21-19'),
      ],
      R,
    );
    const gd = (id: ID) => row(rows, id).gamesWon - row(rows, id).gamesLost;
    expect(gd('A')).toBeGreaterThan(gd('B'));
    expect(gd('C')).toBeGreaterThan(gd('D'));
    expect(order(rows)).toEqual(['B', 'A', 'D', 'C']);
    expect(notes(rows)).toEqual({ A: 'Head-to-head', B: 'Head-to-head', C: 'Head-to-head', D: 'Head-to-head' });
  });

  it('three tied on wins → game difference (not head-to-head)', () => {
    // A > B 2-0, B > C 2-1, C > A 2-1 → game difference A +1, C 0, B -1. Head-to-head would put C above A.
    const { rows } = computeStandings(
      'g1',
      ['A', 'B', 'C'],
      [m('A', 'B', '21-10 21-10'), m('B', 'C', '21-10 10-21 21-10'), m('C', 'A', '21-10 10-21 21-10')],
      R,
    );
    expect(order(rows)).toEqual(['A', 'C', 'B']);
    expect(notes(rows)).toEqual({ A: 'Game difference', B: 'Game difference', C: 'Game difference' });
  });

  it('three tied → game difference separates one, head-to-head decides the remaining two', () => {
    // A, B, C each beat D and go round in a 2-0 circle. Against D: A 2-0, B 2-1, C 2-1.
    // → A clear on game difference; B and C level, B beat C. C has the better point difference.
    const { rows } = computeStandings(
      'g1',
      ['A', 'B', 'C', 'D'],
      [
        m('A', 'B', '21-10 21-10'),
        m('B', 'C', '21-19 21-19'),
        m('C', 'A', '21-10 21-10'),
        m('A', 'D', '21-10 21-10'),
        m('B', 'D', '21-19 19-21 21-19'),
        m('C', 'D', '21-0 0-21 21-0'),
      ],
      R,
    );
    const pd = (id: ID) => row(rows, id).pointsWon - row(rows, id).pointsLost;
    expect(pd('C')).toBeGreaterThan(pd('B'));
    expect(order(rows)).toEqual(['A', 'B', 'C', 'D']);
    expect(notes(rows)).toEqual({ A: 'Game difference', B: 'Head-to-head', C: 'Head-to-head', D: undefined });
  });

  it('three tied on wins and games → point difference', () => {
    // 2-0 circle: A +22 vs B, B +12 vs C, C +4 vs A → points A +18, C -8, B -10.
    const { rows } = computeStandings(
      'g1',
      ['A', 'B', 'C'],
      [m('A', 'B', '21-10 21-10'), m('B', 'C', '21-15 21-15'), m('C', 'A', '21-19 21-19')],
      R,
    );
    expect(order(rows)).toEqual(['A', 'C', 'B']);
    expect(notes(rows)).toEqual({ A: 'Point difference', B: 'Point difference', C: 'Point difference' });
  });

  it('three tied on wins and games → point difference separates one, head-to-head decides the other two', () => {
    // 2-0 circle: A > B by 8 pts, B > C by 4, C > A by 12 → points A -4, B -4, C +8.
    // → C first on point difference, then A vs B by head-to-head (A beat B).
    const { rows } = computeStandings(
      'g1',
      ['A', 'B', 'C'],
      [m('A', 'B', '21-17 21-17'), m('B', 'C', '21-19 21-19'), m('C', 'A', '21-15 21-15')],
      R,
    );
    expect(order(rows)).toEqual(['C', 'A', 'B']);
    expect(notes(rows)).toEqual({ C: 'Point difference', A: 'Head-to-head', B: 'Head-to-head' });
  });

  describe('fully level three-way tie', () => {
    const matches = () => [m('A', 'B', '21-15 21-15'), m('B', 'C', '21-15 21-15'), m('C', 'A', '21-15 21-15')];

    it('is drawn by lot once the group is complete, deterministically per group id', () => {
      const first = computeStandings('ev-groups-A', ['A', 'B', 'C'], matches(), R);
      const again = computeStandings('ev-groups-A', ['A', 'B', 'C'], matches(), R);
      expect(first.complete).toBe(true);
      expect(first.rows.every((r) => r.note === 'Drawn by lot')).toBe(true);
      expect(order(first.rows).sort()).toEqual(['A', 'B', 'C']);
      expect(order(again.rows)).toEqual(order(first.rows));
      expect(first.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    });

    it('different groups can draw different lots', () => {
      const orders = new Set(
        Array.from({ length: 20 }, (_, i) => order(computeStandings(`group-${i}`, ['A', 'B', 'C'], matches(), R).rows).join('')),
      );
      expect(orders.size).toBeGreaterThan(1);
    });

    it('stays "Level" (no lot) while the group is still being played', () => {
      const { rows, complete } = computeStandings('g1', ['A', 'B', 'C', 'D'], [...matches(), unplayed('A', 'D')], R);
      expect(complete).toBe(false);
      expect(order(rows).slice(0, 3)).toEqual(['A', 'B', 'C']);
      expect(rows.slice(0, 3).every((r) => r.note === 'Level')).toBe(true);
    });
  });

  it('a walkover counts as a 2-0 win (21-0 21-0) and ignores any games entered', () => {
    const wo: Match = { ...special('A', 'B', 'walkover', 'b'), games: [[3, 1]] };
    const { rows } = computeStandings('g1', ['A', 'B'], [wo], R);
    expect(order(rows)).toEqual(['B', 'A']);
    expect(row(rows, 'B')).toMatchObject({ played: 1, won: 1, lost: 0, gamesWon: 2, gamesLost: 0, pointsWon: 42, pointsLost: 0 });
    expect(row(rows, 'A')).toMatchObject({ played: 1, won: 0, lost: 1, gamesWon: 0, gamesLost: 2, pointsWon: 0, pointsLost: 42 });
  });

  it('a retirement counts the games and points actually played', () => {
    const retired: Match = {
      ...special('A', 'B', 'retired', 'a'),
      games: [
        [15, 21],
        [11, 4],
      ],
    };
    const { rows } = computeStandings('g1', ['A', 'B'], [retired], R);
    expect(row(rows, 'A')).toMatchObject({ won: 1, gamesWon: 0, gamesLost: 1, pointsWon: 26, pointsLost: 25 });
    expect(row(rows, 'B')).toMatchObject({ lost: 1, gamesWon: 1, gamesLost: 0 });
  });

  it('ignores unfinished matches and lists entries with no results', () => {
    const { rows, complete } = computeStandings(
      'g1',
      ['A', 'B', 'C'],
      [m('A', 'B', '21-5 21-5'), unplayed('A', 'C'), unplayed('B', 'C')],
      R,
    );
    expect(complete).toBe(false);
    expect(order(rows)[0]).toBe('A');
    expect(row(rows, 'C')).toMatchObject({ played: 0, won: 0, lost: 0 });
  });
});
