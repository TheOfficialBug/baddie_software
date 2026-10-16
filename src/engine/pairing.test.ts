import { describe, expect, it } from 'vitest';

import { bwfSeedCount, nextPow2 } from './draws';
import { arrangeBalanced, type Arrangement, chooseByes, LEVEL_VALUE, rankByLevel, separateGroups } from './pairing';
import { mulberry32 } from './rng';
import type { ID } from './types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const LETTERS = ['A', 'B', 'C', 'D'] as const;
type Letter = (typeof LETTERS)[number];

/** A field of `n` entries with a letter level and a club each. */
interface Field {
  ids: ID[];
  level: Record<ID, Letter>;
  club: Record<ID, string>;
  levelOf: (id: ID) => number;
  clubOf: (id: ID) => string | undefined;
}

function field(levels: Letter[], clubs: string[]): Field {
  const ids = levels.map((_, i) => `e${i + 1}`);
  const level = Object.fromEntries(ids.map((id, i) => [id, levels[i]]));
  const club = Object.fromEntries(ids.map((id, i) => [id, clubs[i]]));
  return { ids, level, club, levelOf: (id) => LEVEL_VALUE[level[id]], clubOf: (id) => club[id] };
}

function randomField(n: number, rand: () => number): Field {
  const clubCount = 2 + Math.floor(rand() * 5); // 2..6
  return field(
    range(1, n).map(() => LETTERS[Math.floor(rand() * 4)]),
    range(1, n).map(() => `Club${Math.floor(rand() * clubCount)}`),
  );
}

const pairs = (a: Arrangement) => range(0, a.size / 2 - 1).map((k) => [a.lines[2 * k], a.lines[2 * k + 1]] as const);
const realPairs = (a: Arrangement) => pairs(a).filter(([x, y]) => x !== 'BYE' && y !== 'BYE') as [ID, ID][];
const levelPair = (f: Field, [x, y]: [ID, ID]) => [f.level[x], f.level[y]].sort().join('–');

// ---------------------------------------------------------------------------
// arrangeBalanced: structural invariants for every field size
// ---------------------------------------------------------------------------

describe('arrangeBalanced', () => {
  describe.each(range(2, 64))('N=%i', (N) => {
    it.each(['balanced', 'classic'] as const)('%s: valid draw, byes to seeds and the top of the ranking, seeds 1/2 apart', (pairing) => {
      for (const s of [1, 2, 3, 4]) {
        const rand = mulberry32(N * 31 + s);
        const f = randomField(N, rand);
        const seeds = bwfSeedCount(N);
        const a = arrangeBalanced({ entryIds: f.ids, seeds, levelOf: f.levelOf, clubOf: f.clubOf, pairing, rand });
        const S = nextPow2(N);
        const byes = S - N;

        expect(a.size).toBe(S);
        expect(a.lines).toHaveLength(S);
        expect(a.lines.filter((x) => x !== 'BYE').sort()).toEqual([...f.ids].sort());
        expect([...a.ranking].sort()).toEqual([...f.ids].sort());
        expect(a.ranking.slice(0, seeds)).toEqual(f.ids.slice(0, seeds));

        expect(a.lines.filter((x) => x === 'BYE')).toHaveLength(byes);
        const byeHolders = pairs(a)
          .filter(([x, y]) => x === 'BYE' || y === 'BYE')
          .map(([x, y]) => (x === 'BYE' ? y : x));
        expect(byeHolders).not.toContain('BYE'); // no BYE vs BYE
        expect([...byeHolders].sort()).toEqual(chooseByes(a.ranking, seeds, byes, f.levelOf, f.clubOf).byeHolders.sort());
        expect(byeHolders).toEqual(expect.arrayContaining(a.ranking.slice(0, Math.min(seeds, byes))));

        if (S >= 4) {
          const half = (id: ID) => (a.lines.indexOf(id) < S / 2 ? 'top' : 'bottom');
          expect(half(a.ranking[0])).not.toBe(half(a.ranking[1]));
        }

        // every reported clash is a real same-club round-1 pair, and every same-club pair is reported
        const clashing = realPairs(a).filter(([x, y]) => f.club[x] === f.club[y]);
        expect(a.clubClashes).toEqual(clashing);
      }
    });
  });

  it('is reproducible for the same RNG seed', () => {
    const f = randomField(23, mulberry32(9));
    const run = () =>
      arrangeBalanced({ entryIds: f.ids, seeds: 4, levelOf: f.levelOf, clubOf: f.clubOf, pairing: 'balanced', rand: mulberry32(77) });
    expect(run()).toEqual(run());
  });
});

// ---------------------------------------------------------------------------
// level pairing
// ---------------------------------------------------------------------------

describe('arrangeBalanced level pairing', () => {
  const sixteen = field(
    [...'AAAABBBBCCCCDDDD'] as Letter[],
    range(1, 16).map((i) => `Club${i}`),
  );

  it.each([
    ['balanced', { 'A–C': 4, 'B–D': 4 }],
    ['classic', { 'A–D': 4, 'B–C': 4 }],
  ] as const)('%s: 4 of each level → %j', (pairing, expected) => {
    for (const s of range(1, 10)) {
      const a = arrangeBalanced({
        entryIds: sixteen.ids,
        seeds: 0,
        levelOf: sixteen.levelOf,
        clubOf: sixteen.clubOf,
        pairing,
        rand: mulberry32(s),
      });
      const counts: Record<string, number> = {};
      for (const p of realPairs(a)) counts[levelPair(sixteen, p)] = (counts[levelPair(sixteen, p)] ?? 0) + 1;
      expect(counts).toEqual(expected);
      expect(a.clubClashes).toEqual([]);
    }
  });

  it('balanced: the strongest pairs are spread like seeds (one A–C pair per quarter)', () => {
    const a = arrangeBalanced({
      entryIds: sixteen.ids,
      seeds: 0,
      levelOf: sixteen.levelOf,
      clubOf: sixteen.clubOf,
      pairing: 'balanced',
      rand: mulberry32(3),
    });
    const quarters = pairs(a)
      .map((p, k) => [levelPair(sixteen, p as [ID, ID]), Math.floor(k / 2)] as const)
      .filter(([lp]) => lp === 'A–C')
      .map(([, q]) => q);
    expect(quarters.sort()).toEqual([0, 1, 2, 3]);
  });

  it('uneven levels (10 A, 2 B, 1 C, 7 D) still give a valid draw ranked by level after the seeds', () => {
    const levels = [...'AAAAAAAAAABBCDDDDDDD'] as Letter[];
    // shuffle so input order is not already sorted
    const order = [5, 17, 0, 11, 19, 2, 8, 14, 1, 12, 6, 18, 3, 10, 15, 7, 13, 4, 16, 9];
    const f = field(
      order.map((i) => levels[i]),
      order.map((i) => `Club${i % 5}`),
    );
    for (const pairing of ['balanced', 'classic'] as const) {
      for (const seeds of [0, 2, 4]) {
        const a = arrangeBalanced({ entryIds: f.ids, seeds, levelOf: f.levelOf, clubOf: f.clubOf, pairing, rand: mulberry32(seeds + 1) });
        expect(a.size).toBe(32);
        expect(a.lines.filter((x) => x !== 'BYE').sort()).toEqual([...f.ids].sort());
        expect(a.lines.filter((x) => x === 'BYE')).toHaveLength(12);
        expect(a.ranking.slice(0, seeds)).toEqual(f.ids.slice(0, seeds));
        const rest = a.ranking.slice(seeds).map(f.levelOf);
        expect(rest).toEqual([...rest].sort((x, y) => y - x));
      }
    }
  });

  it('rankByLevel keeps the seeds in order and sorts the rest strongest first', () => {
    const f = field([...'DCBADCBA'] as Letter[], range(1, 8).map(String));
    const r = rankByLevel(f.ids, 2, f.levelOf, mulberry32(1));
    expect(r.slice(0, 2)).toEqual(['e1', 'e2']);
    expect(r.slice(2).map((id) => f.level[id])).toEqual(['A', 'A', 'B', 'B', 'C', 'D']);
  });
});

// ---------------------------------------------------------------------------
// club separation
// ---------------------------------------------------------------------------

describe('arrangeBalanced club separation', () => {
  it('separates a handcrafted field: 8 entries, 4 clubs × 2, mixed levels', () => {
    // Same-club entries are at the same level, so the plain level pairing would make them meet.
    const f = field([...'AACCBBDD'] as Letter[], ['X', 'Y', 'X', 'Y', 'Z', 'W', 'Z', 'W']);
    for (const pairing of ['balanced', 'classic'] as const) {
      for (const s of range(1, 25)) {
        const a = arrangeBalanced({ entryIds: f.ids, seeds: 0, levelOf: f.levelOf, clubOf: f.clubOf, pairing, rand: mulberry32(s) });
        expect(a.clubClashes, `${pairing} seed ${s}`).toEqual([]);
        for (const [x, y] of realPairs(a)) expect(f.club[x]).not.toBe(f.club[y]);
      }
    }
  });

  it('separates 16 entries from 4 clubs of 4 (balanced and classic)', () => {
    const f = field(
      range(0, 15).map((i) => LETTERS[i % 4]),
      range(0, 15).map((i) => `Club${i % 4}`), // each club is a single level: worst case for level pairing
    );
    for (const pairing of ['balanced', 'classic'] as const) {
      for (const s of range(1, 25)) {
        const a = arrangeBalanced({ entryIds: f.ids, seeds: 4, levelOf: f.levelOf, clubOf: f.clubOf, pairing, rand: mulberry32(s) });
        expect(a.clubClashes, `${pairing} seed ${s}`).toEqual([]);
      }
    }
  });

  /** Largest club among the given entries. */
  const biggestClub = (f: Field, ids: ID[]) =>
    Math.max(...ids.reduce((m, id) => m.set(f.club[id], (m.get(f.club[id]) ?? 0) + 1), new Map<string, number>()).values());

  it.each(['balanced', 'classic'] as const)('%s: random fields (N=4..64) — clean whenever separation is possible', (pairing) => {
    // Separation is possible iff no club holds more than half of the entries that actually play round 1. Over all such fields there must be no clash; over the rest,
    // every reported clash must be genuine and at least the unavoidable number of clashes is reported.
    let feasible = 0;
    let clean = 0;
    for (const N of range(4, 64)) {
      for (const s of range(1, 10)) {
        const rand = mulberry32(N * 1000 + s);
        const f = randomField(N, rand);
        const a = arrangeBalanced({ entryIds: f.ids, seeds: bwfSeedCount(N), levelOf: f.levelOf, clubOf: f.clubOf, pairing, rand });
        const players = chooseByes(a.ranking, bwfSeedCount(N), a.size - N, f.levelOf, f.clubOf).players;
        const big = biggestClub(f, players);
        for (const [x, y] of a.clubClashes) expect(f.club[x]).toBe(f.club[y]);
        if (big <= players.length / 2) {
          feasible++;
          expect(a.clubClashes, `N=${N} seed=${s}`).toEqual([]);
        } else {
          expect(a.clubClashes.length, `N=${N} seed=${s}`).toBeGreaterThanOrEqual(big - players.length / 2);
        }
        if (a.clubClashes.length === 0) clean++;
      }
    }
    expect(feasible).toBeGreaterThan(400);
    expect(clean).toBeGreaterThanOrEqual(feasible);
  });

  it.each([2, 5, 8, 13, 16])('all %i entries from one club → every real pair is reported', (n) => {
    const f = field(
      range(1, n).map((i) => LETTERS[i % 4]),
      range(1, n).map(() => 'Solo'),
    );
    const a = arrangeBalanced({
      entryIds: f.ids,
      seeds: 0,
      levelOf: f.levelOf,
      clubOf: f.clubOf,
      pairing: 'balanced',
      rand: mulberry32(1),
    });
    expect(a.clubClashes).toHaveLength((n - (a.size - n)) / 2);
    expect(a.clubClashes).toEqual(realPairs(a));
  });

  it('entries without a club never clash', () => {
    const f = field([...'AABBCCDD'] as Letter[], Array(8).fill(''));
    const a = arrangeBalanced({
      entryIds: f.ids,
      seeds: 0,
      levelOf: f.levelOf,
      clubOf: () => undefined,
      pairing: 'balanced',
      rand: mulberry32(1),
    });
    expect(a.clubClashes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// separateGroups
// ---------------------------------------------------------------------------

describe('separateGroups', () => {
  const clubOf = (id: ID) => id.replace(/\d+$/, ''); // "x1" → club "x"
  const sameClubInGroup = (groups: ID[][]) => groups.some((g) => new Set(g.map(clubOf)).size < g.length);
  const flat = (groups: ID[][]) => groups.flat().sort();

  it.each<[string, ID[][]]>([
    [
      'two clubmates in one group',
      [
        ['x1', 'x2', 'a1', 'b1'],
        ['c1', 'd1', 'e1', 'f1'],
      ],
    ],
    [
      'two pairs of clubmates',
      [
        ['x1', 'x2', 'a1', 'b1'],
        ['y1', 'y2', 'c1', 'd1'],
      ],
    ],
    [
      'three groups, uneven sizes',
      [
        ['x1', 'a1', 'x2', 'b1'],
        ['c1', 'y1', 'y2'],
        ['d1', 'e1', 'f1'],
      ],
    ],
    [
      'clubmates in the middle tier',
      [
        ['a1', 'x1', 'x2'],
        ['c1', 'y1', 'd1'],
        ['e1', 'z1', 'f1'],
      ],
    ],
  ])('%s: moves clubmates apart with same-position swaps', (_label, groups) => {
    const out = separateGroups(groups, clubOf);
    expect(sameClubInGroup(out)).toBe(false);
    expect(out.map((g) => g.length)).toEqual(groups.map((g) => g.length));
    expect(flat(out)).toEqual(flat(groups));
    // only same-position swaps: every entry keeps its position index
    groups.forEach((g, gi) =>
      g.forEach((id, pos) =>
        expect(
          out.some((o) => o[pos] === id),
          `${id}@${pos} (group ${gi})`,
        ).toBe(true),
      ),
    );
  });

  it('does not mutate its input', () => {
    const groups = [
      ['x1', 'x2'],
      ['a1', 'b1'],
    ];
    const snapshot = JSON.stringify(groups);
    separateGroups(groups, clubOf);
    expect(JSON.stringify(groups)).toBe(snapshot);
  });

  it('leaves groups alone when separation is impossible (one club)', () => {
    const groups = [
      ['x1', 'x2', 'x3'],
      ['x4', 'x5', 'x6'],
    ];
    const out = separateGroups(groups, clubOf);
    expect(out).toEqual(groups);
  });

  it('leaves already-separated groups unchanged', () => {
    const groups = [
      ['x1', 'y1', 'z1'],
      ['x2', 'y2', 'z2'],
    ];
    expect(separateGroups(groups, clubOf)).toEqual(groups);
  });
});

describe('chooseByes', () => {
  const lv = (levels: Record<ID, number>) => (id: ID) => levels[id];

  it('keeps byes at the top of the ranking when round 1 is already mixed', () => {
    const ranking = ['a', 'b', 'c', 'd', 'e', 'f'];
    const levelOf = lv({ a: 4, b: 4, c: 3, d: 3, e: 2, f: 1 });
    expect(chooseByes(ranking, 1, 2, levelOf)).toEqual({ byeHolders: ['a', 'b'], players: ['c', 'd', 'e', 'f'] });
  });

  it('swaps the lowest unseeded bye-holders in when round 1 would be all one level', () => {
    // like 35 pairs in a 64-draw: the 6 left to play are all D
    const ids = Array.from({ length: 10 }, (_, i) => `e${i + 1}`);
    const level: Record<ID, number> = Object.fromEntries(ids.map((id, i) => [id, i < 4 ? 3 : i < 6 ? 2 : 1]));
    const { byeHolders, players } = chooseByes(ids, 2, 6, lv(level));
    expect(byeHolders).toEqual(['e1', 'e2', 'e3', 'e4', 'e7', 'e8']);
    expect(players).toEqual(['e5', 'e6', 'e9', 'e10']);
    // so no D meets a D in round 1
    const a = arrangeBalanced({
      entryIds: ids,
      seeds: 2,
      levelOf: lv(level),
      clubOf: () => undefined,
      pairing: 'balanced',
      rand: mulberry32(1),
    });
    expect(realPairs(a).map(([x, y]) => [level[x], level[y]].sort().join('v'))).toEqual(['1v2', '1v2']);
  });

  it('never takes a bye from a seed', () => {
    const levelOf = lv({ a: 1, b: 1, c: 1, d: 1 });
    expect(chooseByes(['a', 'b', 'c', 'd'], 2, 2, levelOf).byeHolders).toEqual(['a', 'b']);
  });
});
