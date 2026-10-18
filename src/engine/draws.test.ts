import { describe, expect, it } from 'vitest';

import { spreadClubs } from './clubSpread';
import { bwfSeedCount, type DrawInput, generateDraw, groupCount, nextPow2, placeKnockout, roundRobinPairs, seedLines } from './draws';
import { arrangeBalanced, arrangeDropFlight, LEVEL_VALUE, rankByLevel, separateGroups } from './pairing';
import { resolveMatches } from './progression';
import { hashString, mulberry32, shuffle } from './rng';
import { RULES } from './rules';
import type { DrawPlan, EventConfig, ID, Match, Mode, SlotSource, TEvent } from './types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const entryIds = (n: number) => range(1, n).map((i) => `e${i}`);

function makeEvent(mode: Mode, config: Partial<EventConfig> = {}): TEvent {
  return {
    id: 'ev',
    tournamentId: 't1',
    kind: 'MS',
    name: 'Test event',
    fee: 0,
    cap: 128,
    rules: 'BWF_3x21',
    mode,
    config: { groupSize: 4, advance: 2, variant: 'ABCD', thirdPlace: true, plate: false, seeds: 0, ...config },
    drawState: 'none',
  };
}

function draw(mode: Mode, n: number, config: Partial<EventConfig> = {}, extra: Partial<DrawInput> = {}): DrawPlan {
  return generateDraw({
    event: makeEvent(mode, config),
    entryIds: entryIds(n),
    seeds: 0,
    rngSeed: 42,
    clubOf: () => undefined,
    ...extra,
  });
}

const stageSizes = (plan: DrawPlan) => Object.fromEntries(plan.stages.map((s) => [s.flight ?? s.name, s.size]));
const matchesIn = (plan: DrawPlan, stageId: ID) => plan.matches.filter((m) => m.stageId === stageId);
const quarterOf = (line: number, S: number) => Math.floor(line / (S / 4));
const halfOf = (line: number, S: number) => (line < S / 2 ? 0 : 1);
const partner = (line: number) => line ^ 1;
const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;

// ---------------------------------------------------------------------------
// seedLines / bwfSeedCount / nextPow2
// ---------------------------------------------------------------------------

describe('seedLines', () => {
  const sizes = [2, 4, 8, 16, 32, 64, 128];

  it.each(sizes)('S=%i: seed 1 on the top line, seed 2 on the bottom line', (S) => {
    const lineOf = seedLines(S);
    expect(lineOf[0]).toBe(0);
    expect(lineOf[1]).toBe(S - 1);
  });

  it.each(sizes)('S=%i: every line is used exactly once', (S) => {
    const lineOf = seedLines(S);
    expect(lineOf).toHaveLength(S);
    expect([...lineOf].sort((x, y) => x - y)).toEqual(range(0, S - 1));
  });

  it.each(sizes.filter((S) => S >= 8))('S=%i: seeds 3/4 at the top of the 2nd quarter and the bottom of the 3rd', (S) => {
    const lineOf = seedLines(S);
    expect([lineOf[2], lineOf[3]].sort((x, y) => x - y)).toEqual([S / 4, (3 * S) / 4 - 1]);
  });

  it.each(sizes.filter((S) => S >= 4))('S=%i: seeds 1..S/2 never share a round-1 pair', (S) => {
    const lineOf = seedLines(S);
    const pairs = lineOf.slice(0, S / 2).map((l) => l >> 1);
    expect(new Set(pairs).size).toBe(S / 2);
  });
});

describe('bwfSeedCount', () => {
  it.each([
    [70, 16],
    [64, 16],
    [63, 8],
    [40, 8],
    [32, 8],
    [31, 4],
    [20, 4],
    [16, 4],
    [15, 2],
    [2, 2],
    [1, 1],
  ])('%i entries → %i seeds', (n, seeds) => {
    expect(bwfSeedCount(n)).toBe(seeds);
  });
});

describe('nextPow2', () => {
  it.each([
    [1, 2],
    [2, 2],
    [3, 4],
    [5, 8],
    [32, 32],
    [33, 64],
  ])('%i → %i', (n, s) => expect(nextPow2(n)).toBe(s));
});

// ---------------------------------------------------------------------------
// placeKnockout: byes and seeding for every draw size 2..70
// ---------------------------------------------------------------------------

describe('placeKnockout', () => {
  const rngSeeds = [1, 7, 99];

  describe.each(range(2, 70))('N=%i', (N) => {
    const k = Math.min(bwfSeedCount(N), N);
    const S = nextPow2(N);
    const B = S - N;
    const ids = entryIds(N);
    const seeded = ids.slice(0, k);
    const placements = rngSeeds.map((s) => placeKnockout(seeded, ids.slice(k), mulberry32(s), () => undefined));

    it(`fills ${S} lines with ${B} byes, every entry exactly once, no BYE vs BYE`, () => {
      for (const p of placements) {
        expect(p.size).toBe(S);
        expect(p.lines).toHaveLength(S);
        expect(p.lines.filter((x) => x === 'BYE')).toHaveLength(B);
        expect(p.lines.filter((x) => x !== 'BYE').sort()).toEqual([...ids].sort());
        for (let l = 0; l < S; l += 2) expect([p.lines[l], p.lines[l + 1]]).not.toEqual(['BYE', 'BYE']);
        expect(p.clubClashes).toEqual([]);
      }
    });

    it(`gives byes to the top seeds first (${k} seeds)`, () => {
      for (const p of placements) {
        const seedLine = seeded.map((id) => p.lines.indexOf(id));
        seedLine.forEach((line, i) => {
          const opp = p.lines[partner(line)];
          if (i < B) expect(opp, `seed ${i + 1} should have a bye`).toBe('BYE');
          else expect(opp, `seed ${i + 1} should not have a bye`).not.toBe('BYE');
        });
      }
    });

    it('puts seeds 1 and 2 in opposite halves (and on the end lines)', () => {
      for (const p of placements) {
        if (k < 2) continue;
        expect(p.lines[0]).toBe(seeded[0]);
        expect(p.lines[S - 1]).toBe(seeded[1]);
        expect(halfOf(p.lines.indexOf(seeded[0]), S)).not.toBe(halfOf(p.lines.indexOf(seeded[1]), S));
      }
    });

    if (S >= 8 && k >= 4) {
      it('puts seeds 1–4 in four different quarters', () => {
        for (const p of placements) {
          const quarters = seeded.slice(0, 4).map((id) => quarterOf(p.lines.indexOf(id), S));
          expect(new Set(quarters).size).toBe(4);
        }
      });
    }
  });

  it('is reproducible for the same RNG seed', () => {
    const ids = entryIds(37);
    const a = placeKnockout(ids.slice(0, 8), ids.slice(8), mulberry32(5), () => undefined);
    const b = placeKnockout(ids.slice(0, 8), ids.slice(8), mulberry32(5), () => undefined);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// placeKnockout: club separation (GCR 11.11.2)
// ---------------------------------------------------------------------------

describe('placeKnockout club separation', () => {
  /** Round-1 pairs (excluding byes) whose two entries share a club. */
  function sameClubPairs(lines: (ID | 'BYE')[], clubOf: (id: ID) => string | undefined): [ID, ID][] {
    const out: [ID, ID][] = [];
    for (let l = 0; l < lines.length; l += 2) {
      const [x, y] = [lines[l], lines[l + 1]];
      if (x === 'BYE' || y === 'BYE') continue;
      const c = clubOf(x);
      if (c && c === clubOf(y)) out.push([x, y]);
    }
    return out;
  }

  const cases: { name: string; n: number; seeds: number; clubs: (i: number) => string }[] = [
    { name: '16 entries, half of them from one club', n: 16, seeds: 4, clubs: (i) => (i % 2 ? 'Alpha' : `Solo${i}`) },
    { name: '12 entries (4 byes), 6 from one club incl. seed 1', n: 12, seeds: 2, clubs: (i) => (i < 6 ? 'Alpha' : `Solo${i}`) },
    { name: '32 entries, three big clubs', n: 32, seeds: 8, clubs: (i) => ['Alpha', 'Beta', 'Gamma'][i % 3] },
    { name: '24 entries, two clubs of 8', n: 24, seeds: 4, clubs: (i) => (i < 8 ? 'Alpha' : i < 16 ? 'Beta' : `Solo${i}`) },
  ];

  it.each(cases)('separates when possible: $name', ({ n, seeds, clubs }) => {
    const ids = entryIds(n);
    const clubOf = (id: ID) => clubs(ids.indexOf(id));
    for (const rngSeed of range(1, 20)) {
      const p = placeKnockout(ids.slice(0, seeds), ids.slice(seeds), mulberry32(rngSeed), clubOf);
      expect(p.clubClashes).toEqual([]);
      expect(sameClubPairs(p.lines, clubOf)).toEqual([]);
      expect(p.lines.filter((x) => x !== 'BYE').sort()).toEqual([...ids].sort());
      // separation must not move seeds or byes
      expect(p.lines[0]).toBe(ids[0]);
      expect(p.lines[p.size - 1]).toBe(ids[1]);
    }
  });

  it.each([
    [8, 4],
    [6, 2], // 2 byes absorb two of the pairs
    [5, 1],
  ])('reports every clash when all %i entries share a club (%i clashes)', (n, clashes) => {
    const ids = entryIds(n);
    const p = placeKnockout(ids.slice(0, 2), ids.slice(2), mulberry32(3), () => 'Alpha');
    expect(p.clubClashes).toHaveLength(clashes);
    expect(p.clubClashes).toEqual(sameClubPairs(p.lines, () => 'Alpha'));
  });

  it('keeps clashes to the unavoidable minimum (6 of 8 from one club → 2)', () => {
    const ids = entryIds(8);
    const clubOf = (id: ID) => (ids.indexOf(id) < 6 ? 'Alpha' : `Solo${id}`);
    for (const rngSeed of range(1, 20)) {
      const p = placeKnockout([], ids, mulberry32(rngSeed), clubOf);
      expect(p.clubClashes).toHaveLength(2);
    }
  });

  it('turns clashes into draw warnings using entry names', () => {
    const plan = draw('knockout', 4, { thirdPlace: false }, { clubOf: () => 'Alpha', nameOf: (id) => `Player ${id}` });
    expect(plan.warnings).toHaveLength(2);
    expect(plan.warnings[0]).toMatch(/^Player e\d and Player e\d are both from Alpha and meet in round 1/);
  });
});

// ---------------------------------------------------------------------------
// generateDraw: structure of each mode
// ---------------------------------------------------------------------------

/** Matches of one round of a stage, in bracket order. */
const roundIn = (plan: DrawPlan, stageId: ID, round: number) =>
  matchesIn(plan, stageId)
    .filter((m) => m.round === round)
    .sort((x, y) => x.index - y.index);
/** Round-1 line sources of a stage, top to bottom. */
const round1Lines = (plan: DrawPlan, stageId: ID): SlotSource[] => roundIn(plan, stageId, 1).flatMap((m) => [m.srcA, m.srcB]);
/** A match that is actually played: neither side is a structural bye. */
const isReal = (m: Match) => m.srcA.kind !== 'bye' && m.srcB.kind !== 'bye';

/** A lower flight / plate holds the loser of the i-th real feeder on seedLines[i] and byes on every other line. */
function expectFedBy(plan: DrawPlan, stageId: ID, feeders: Match[]) {
  const real = feeders.filter(isReal);
  const lines = round1Lines(plan, stageId);
  expect(lines).toHaveLength(nextPow2(real.length));
  const lineOf = seedLines(lines.length);
  real.forEach((f, i) => expect(lines[lineOf[i]], `${stageId} line ${lineOf[i]}`).toEqual({ kind: 'loser', matchId: f.id }));
  expect(lines.filter((s) => s.kind === 'bye')).toHaveLength(lines.length - real.length);
}

describe('generateDraw · knockout', () => {
  it.each([
    { n: 10, plate: false, thirdPlace: true, sizes: { 'Main draw': 16, '3rd place': 2 }, matches: 15 + 1 },
    // 10 entries in 16 lines → only 2 real round-1 matches → a plate of 2
    { n: 10, plate: true, thirdPlace: true, sizes: { 'Main draw': 16, Plate: 2, '3rd place': 2 }, matches: 15 + 1 + 1 },
    // 13 entries → 5 real round-1 matches → a plate of 8 with 3 byes
    { n: 13, plate: true, thirdPlace: false, sizes: { 'Main draw': 16, Plate: 8 }, matches: 15 + 7 },
    { n: 16, plate: true, thirdPlace: true, sizes: { 'Main draw': 16, Plate: 8, '3rd place': 2 }, matches: 15 + 7 + 1 },
    { n: 8, plate: false, thirdPlace: false, sizes: { 'Main draw': 8 }, matches: 7 },
  ])('N=$n plate=$plate third=$thirdPlace', ({ n, plate, thirdPlace, sizes, matches }) => {
    const plan = draw('knockout', n, { plate, thirdPlace });
    expect(stageSizes(plan)).toEqual(sizes);
    expect(plan.matches).toHaveLength(matches);
    expect(new Set(plan.matches.map((m) => m.id)).size).toBe(matches);
    expect(plan.groups).toEqual([]);
  });

  it('feeds the 3rd-place match from the semi-final losers', () => {
    const plan = draw('knockout', 8, { thirdPlace: true });
    const third = plan.matches.find((m) => m.stageId === 'ev-third')!;
    const semis = roundIn(plan, 'ev-main', 2).map((m) => m.id);
    expect([third.srcA, third.srcB]).toEqual(semis.map((matchId) => ({ kind: 'loser', matchId })));
  });

  it('N=3: no 3rd-place match, because one semi-final is a bye', () => {
    const plan = draw('knockout', 3, { thirdPlace: true });
    expect(plan.stages.map((s) => s.name)).toEqual(['Main draw']);
    expect(plan.warnings.join(' ')).toMatch(/3rd-place/);
  });

  describe.each(range(4, 40).filter((n) => !isPow2(n - 1)))('N=%i plate', (n) => {
    it('is built from the losers of real round-1 matches only', () => {
      const plan = draw('knockout', n, { plate: true, thirdPlace: false });
      const plate = plan.stages.find((s) => s.name === 'Plate')!;
      expect(plate).toMatchObject({ kind: 'knockout', flight: undefined, order: 1 });
      const r1 = roundIn(plan, 'ev-main', 1);
      expectFedBy(plan, plate.id, r1);
      for (const m of r1) expect(m.loserTo, m.id).toBe(isReal(m) ? 'Plate' : undefined);
      expect(plan.warnings).toEqual([]);
    });
  });

  it.each([2, 3, 5, 9, 17, 33])('N=%i: a single real round-1 match → no plate, with a warning', (n) => {
    const plan = draw('knockout', n, { plate: true, thirdPlace: false });
    expect(plan.stages.map((s) => s.name)).toEqual(['Main draw']);
    expect(plan.warnings.join(' ')).toMatch(/plate/);
  });
});

describe('generateDraw · drop flight', () => {
  /** Matches in a full bracket of the given size. */
  const bracket = (size: number) => size - 1;
  const flights = (plan: DrawPlan) => plan.stages.map((s) => s.flight).join('');

  it.each([
    { n: 32, sizes: { A: 32, B: 8, C: 16, D: 8 } },
    { n: 8, sizes: { A: 8, B: 2, C: 4, D: 2 } },
    { n: 16, sizes: { A: 16, B: 4, C: 8, D: 4 } },
  ])('ABCD N=$n → $sizes, 2N-4 matches', ({ n, sizes }) => {
    const plan = draw('drop_flight', n, { variant: 'ABCD' });
    expect(stageSizes(plan)).toEqual(sizes);
    expect(plan.matches).toHaveLength(2 * n - 4);
    expect(plan.matches).toHaveLength(
      Object.values(sizes)
        .map(bracket)
        .reduce((x, y) => x + y),
    );
    expect(plan.warnings).toEqual([]);
  });

  it('ABCD N=32: A round-1 losers → C, A round-2 losers → B, C round-1 losers → D', () => {
    const plan = draw('drop_flight', 32, { variant: 'ABCD' });
    expectFedBy(plan, 'ev-C', roundIn(plan, 'ev-A', 1));
    expectFedBy(plan, 'ev-B', roundIn(plan, 'ev-A', 2));
    expectFedBy(plan, 'ev-D', roundIn(plan, 'ev-C', 1));
    expect(roundIn(plan, 'ev-A', 1).every((m) => m.loserTo === 'C flight')).toBe(true);
    expect(roundIn(plan, 'ev-A', 2).every((m) => m.loserTo === 'B flight')).toBe(true);
    expect(roundIn(plan, 'ev-C', 1).every((m) => m.loserTo === 'D flight')).toBe(true);
  });

  it('AB N=16 → A 16, B 8', () => {
    const plan = draw('drop_flight', 16, { variant: 'AB' });
    expect(stageSizes(plan)).toEqual({ A: 16, B: 8 });
    expect(plan.matches).toHaveLength(15 + 7);
  });

  // realR1 = real A round-1 matches = N - S/2. ABCD needs S ≥ 8 and realR1 ≥ 4; a flight needs ≥ 2 real losers.
  it.each([
    { n: 4, flights: 'AB', note: 'S < 8' },
    { n: 5, flights: 'A', note: '1 real A R1 match: no B either' },
    { n: 6, flights: 'AB', note: '2 real A R1 matches' },
    { n: 7, flights: 'AB', note: '3 real A R1 matches' },
    { n: 9, flights: 'A', note: '1 real A R1 match: no B either' },
    { n: 10, flights: 'AB', note: '2 real A R1 matches' },
    { n: 11, flights: 'AB', note: '3 real A R1 matches' },
    { n: 17, flights: 'A', note: '1 real A R1 match: no B either' },
    { n: 18, flights: 'AB', note: '2 real A R1 matches' },
    { n: 19, flights: 'AB', note: '3 real A R1 matches' },
    { n: 33, flights: 'A', note: '1 real A R1 match: no B either' },
  ])('ABCD N=$n falls back → $flights ($note), with a warning', ({ n, flights: expected }) => {
    const plan = draw('drop_flight', n, { variant: 'ABCD' });
    expect(flights(plan)).toBe(expected);
    expect(plan.warnings.join(' ')).toMatch(/uses A\/B instead/);
    if (expected === 'A') expect(plan.warnings.join(' ')).toMatch(/B flight/);
  });

  it.each([8, 12, 20, 24, 32, 14, 15, 16, 22, 23, 36, 40])('ABCD N=%i keeps all four flights, no warning', (n) => {
    const plan = draw('drop_flight', n, { variant: 'ABCD' });
    expect(flights(plan)).toBe('ABCD');
    expect(plan.warnings).toEqual([]);
  });

  it.each([13, 21, 25, 37])('ABCD N=%i: C has a single real round-1 match → no D flight, with a warning', (n) => {
    const plan = draw('drop_flight', n, { variant: 'ABCD' });
    expect(flights(plan)).toBe('ABC');
    expect(roundIn(plan, 'ev-C', 1).filter(isReal)).toHaveLength(1);
    expect(plan.warnings.join(' ')).toMatch(/D flight/);
  });

  describe.each(range(4, 40))('N=%i', (n) => {
    it.each(['ABCD', 'AB'] as const)('%s: every lower flight is fed by real losers only', (variant) => {
      const plan = draw('drop_flight', n, { variant });
      const has = (f: string) => plan.stages.some((s) => s.flight === f);
      const aR1 = roundIn(plan, 'ev-A', 1);
      if (has('C')) {
        expectFedBy(plan, 'ev-B', roundIn(plan, 'ev-A', 2));
        expectFedBy(plan, 'ev-C', aR1);
        if (has('D')) expectFedBy(plan, 'ev-D', roundIn(plan, 'ev-C', 1));
      } else if (has('B')) {
        expectFedBy(plan, 'ev-B', aR1);
        for (const m of aR1) expect(m.loserTo, m.id).toBe(isReal(m) ? 'B flight' : undefined);
      }
    });
  });

  it('ABCD with 4 entries falls back to AB with a warning', () => {
    const plan = draw('drop_flight', 4, { variant: 'ABCD' });
    expect(stageSizes(plan)).toEqual({ A: 4, B: 2 });
    expect(plan.warnings.join(' ')).toMatch(/uses A\/B/);
  });
});

describe('generateDraw · no mostly-empty stages', () => {
  const cases: [Mode, number, Partial<EventConfig>][] = [
    ...range(2, 40).map((n): [Mode, number, Partial<EventConfig>] => ['knockout', n, { plate: true, thirdPlace: true }]),
    ...range(2, 40).map((n): [Mode, number, Partial<EventConfig>] => ['drop_flight', n, { variant: 'ABCD' }]),
    ...range(2, 40).map((n): [Mode, number, Partial<EventConfig>] => ['drop_flight', n, { variant: 'AB' }]),
    ...range(3, 40).map((n): [Mode, number, Partial<EventConfig>] => ['round_robin', n, { groupSize: 4, advance: 1 }]),
    ...range(3, 40).map((n): [Mode, number, Partial<EventConfig>] => ['round_robin', n, { groupSize: 4, advance: 2 }]),
  ];

  it.each(cases)('%s N=%i %j: every knockout stage has ≥ 2 real lines and fewer byes than real lines', (mode, n, config) => {
    const plan = draw(mode, n, config, { seeds: Math.min(bwfSeedCount(n), n) });
    for (const stage of plan.stages.filter((s) => s.kind === 'knockout')) {
      const lines = round1Lines(plan, stage.id);
      const byes = lines.filter((s) => s.kind === 'bye').length;
      const real = lines.length - byes;
      expect(real, stage.name).toBeGreaterThanOrEqual(2);
      expect(byes, stage.name).toBeLessThan(real);
      // and no round-1 match is bye vs bye
      for (const m of roundIn(plan, stage.id, 1)) expect(m.srcA.kind === 'bye' && m.srcB.kind === 'bye', m.id).toBe(false);
    }
  });
});

describe('generateDraw · round robin', () => {
  it.each([
    [10, 5, 2],
    [5, 4, 1],
    [11, 4, 3],
    [12, 4, 3],
    [13, 4, 4],
    [6, 4, 2],
    [3, 4, 1],
    [2, 4, 1],
  ])('groupCount(%i, %i) = %i', (n, size, groups) => {
    expect(groupCount(n, size)).toBe(groups);
  });

  it.each(range(3, 8))('roundRobinPairs(%i): every pair exactly once, nobody twice in a round', (n) => {
    const rounds = roundRobinPairs(n);
    expect(rounds).toHaveLength(n % 2 ? n : n - 1);
    for (const pairs of rounds) {
      const players = pairs.flat();
      expect(new Set(players).size).toBe(players.length);
    }
    const all = rounds.flat().map(([x, y]) => `${x}-${y}`);
    expect(all).toHaveLength((n * (n - 1)) / 2);
    expect(new Set(all).size).toBe(all.length);
  });

  it('roundRobinPairs(4) gives 3 rounds of 2 matches', () => {
    const rounds = roundRobinPairs(4);
    expect(rounds).toHaveLength(3);
    rounds.forEach((r) => expect(r).toHaveLength(2));
  });

  it.each(range(3, 20))('N=%i: groups partition the entries and every pair in a group meets once', (n) => {
    const plan = draw('round_robin', n, { groupSize: 4, advance: 0 });
    const ids = entryIds(n);
    expect(plan.groups).toHaveLength(groupCount(n, 4));
    expect(plan.groups.flatMap((g) => g.entryIds).sort()).toEqual([...ids].sort());
    for (const g of plan.groups) {
      expect(g.entryIds.length).toBeGreaterThanOrEqual(Math.min(3, n));
      const gm = plan.matches.filter((m) => m.groupId === g.id);
      const pairs = gm.map((m) => [(m.srcA as { entryId: ID }).entryId, (m.srcB as { entryId: ID }).entryId].sort().join('|'));
      const sz = g.entryIds.length;
      expect(gm).toHaveLength((sz * (sz - 1)) / 2);
      expect(new Set(pairs).size).toBe(gm.length);
      for (const p of pairs) for (const id of p.split('|')) expect(g.entryIds).toContain(id);
      expect(new Set(gm.map((m) => m.index)).size).toBe(gm.length);
    }
    expect(plan.stages.map((s) => s.kind)).toEqual(['group']);
  });

  it('snake-seeds the groups: 1→A, 2→B, 3→B, 4→A', () => {
    const plan = draw('round_robin', 8, { groupSize: 4, advance: 0 }, { seeds: 4 });
    expect(plan.groups[0].entryIds.slice(0, 2)).toEqual(['e1', 'e4']);
    expect(plan.groups[1].entryIds.slice(0, 2)).toEqual(['e2', 'e3']);
  });

  it('schedules same-club matches first in a group (GCR 16.5)', () => {
    const plan = draw(
      'round_robin',
      4,
      { groupSize: 4, advance: 0 },
      { seeds: 4, clubOf: (id) => (id === 'e2' || id === 'e3' ? 'Alpha' : undefined) },
    );
    const first = plan.matches.find((m) => m.index === 0)!;
    expect(new Set([(first.srcA as { entryId: ID }).entryId, (first.srcB as { entryId: ID }).entryId])).toEqual(new Set(['e2', 'e3']));
  });

  it.each([
    { n: 8, advance: 2 as const, koSize: 4 }, // 2 groups × 2
    { n: 10, advance: 2 as const, koSize: 8 }, // 3 groups × 2 = 6 → 8 lines, 2 byes
    { n: 12, advance: 1 as const, koSize: 4 }, // 3 groups × 1 = 3 → 4 lines, 1 bye
    { n: 20, advance: 2 as const, koSize: 16 },
    { n: 4, advance: 1 as const, koSize: 0 },
  ])('N=$n advance=$advance → knockout of $koSize', ({ n, advance, koSize }) => {
    const plan = draw('round_robin', n, { groupSize: 4, advance });
    const ko = plan.stages.find((s) => s.kind === 'knockout');
    expect(ko?.size ?? 0).toBe(koSize);
    if (!ko) return;
    const r1: Match[] = matchesIn(plan, ko.id).filter((m) => m.round === 1);
    const groupSlots = r1.flatMap((m) => [m.srcA, m.srcB]).filter((s) => s.kind === 'group');
    expect(groupSlots).toHaveLength(plan.groups.length * advance);
  });
});

// ---------------------------------------------------------------------------
// generateDraw with skill levels (levelOf + event.config.pairing)
// ---------------------------------------------------------------------------

describe('generateDraw · level-aware pairing', () => {
  const LETTERS = ['A', 'B', 'C', 'D'];
  /** deterministic pseudo-random level (1..4) and club per entry id */
  const levelOf = (id: ID) => 1 + (hashString(`lvl:${id}`) % 4);
  const clubOf = (id: ID) => `Club${hashString(`club:${id}`) % 5}`;
  const RNG = 42;
  const lineEntries = (plan: DrawPlan, stageId: ID) =>
    round1Lines(plan, stageId).map((s) => (s.kind === 'entry' ? s.entryId : s.kind === 'bye' ? 'BYE' : '?'));
  /** the old round-robin grouping: seeds, then the rest by lot, snaked over the groups */
  const snake = (ordered: ID[], G: number) => {
    const groups: ID[][] = Array.from({ length: G }, () => []);
    ordered.forEach((id, i) => {
      const row = Math.floor(i / G);
      groups[row % 2 === 0 ? i % G : G - 1 - (i % G)].push(id);
    });
    return groups;
  };

  describe.each([3, 8, 10, 16, 23, 37])('N=%i', (n) => {
    const seeds = Math.min(bwfSeedCount(n), n);

    it.each([
      ['knockout', 'ev-main', 'balanced'],
      ['knockout', 'ev-main', 'classic'],
      ['drop_flight', 'ev-A', 'balanced'],
      ['drop_flight', 'ev-A', 'classic'],
    ] as const)('%s %s with %s pairing places entries (drop flight: C/D v A/B), then spreads clubmates', (mode, stageId, pairing) => {
      // drop flight A/B: A/B/C/D with levels is drawn by levelledFlights (tested below)
      const plan = draw(mode, n, { pairing, variant: 'AB' }, { seeds, levelOf, clubOf, rngSeed: RNG });
      const ids = entryIds(n);
      const arrange = mode === 'drop_flight' ? arrangeDropFlight : arrangeBalanced;
      const arranged = arrange({ entryIds: ids, seeds, levelOf, clubOf, pairing, rand: mulberry32(RNG) });
      const expected = spreadClubs({
        lines: arranged.lines,
        seeded: new Set(ids.slice(0, seeds)),
        clubOf,
        sameStrength: (a, b) => levelOf(a) === levelOf(b),
      });
      expect(lineEntries(plan, stageId)).toEqual(expected);
    });

    it.each(['knockout', 'drop_flight', 'round_robin'] as const)(
      "%s: 'random' pairing ignores levelOf (identical to no levels)",
      (mode) => {
        const config = { pairing: 'random' as const, plate: true };
        const withLevels = draw(mode, n, config, { seeds, levelOf, clubOf, rngSeed: RNG });
        const without = draw(mode, n, config, { seeds, clubOf, rngSeed: RNG });
        expect(withLevels).toEqual(without);
      },
    );

    it.each(['knockout', 'drop_flight'] as const)('%s without levelOf uses the BWF draw by lot, then spreads clubmates', (mode) => {
      const stageId = mode === 'knockout' ? 'ev-main' : 'ev-A';
      for (const pairing of ['balanced', 'classic', 'random'] as const) {
        const plan = draw(mode, n, { pairing }, { seeds, clubOf, rngSeed: RNG });
        const ids = entryIds(n);
        const lot = placeKnockout(ids.slice(0, seeds), ids.slice(seeds), mulberry32(RNG), clubOf);
        expect(lineEntries(plan, stageId)).toEqual(spreadClubs({ lines: lot.lines, seeded: new Set(ids.slice(0, seeds)), clubOf }));
      }
    });

    it('round robin without levelOf (no clubs) groups exactly as before: seeds, rest by lot, snake', () => {
      for (const pairing of ['balanced', 'random'] as const) {
        const plan = draw('round_robin', n, { pairing, groupSize: 4, advance: 0 }, { seeds, rngSeed: RNG });
        const ids = entryIds(n);
        const ordered = [...ids.slice(0, seeds), ...shuffle(ids.slice(seeds), mulberry32(RNG))];
        expect(plan.groups.map((g) => g.entryIds)).toEqual(snake(ordered, groupCount(n, 4)));
      }
    });

    it('round robin with levelOf: rank by level, snake, then separate clubmates', () => {
      const plan = draw('round_robin', n, { pairing: 'balanced', groupSize: 4, advance: 0 }, { seeds, levelOf, clubOf, rngSeed: RNG });
      const ranked = rankByLevel(entryIds(n), seeds, levelOf, mulberry32(RNG));
      expect(plan.groups.map((g) => g.entryIds)).toEqual(separateGroups(snake(ranked, groupCount(n, 4)), clubOf));
    });
  });

  it('drop flight, 16 entries with 4 of each level, balanced → A round 1 is all A–C and B–D', () => {
    const lv = (id: ID) => LEVEL_VALUE[LETTERS[(Number(id.slice(1)) - 1) % 4]];
    const plan = draw('drop_flight', 16, { pairing: 'balanced' }, { levelOf: lv, clubOf: (id) => `C-${id}` });
    const letter = (id: ID) => LETTERS[4 - lv(id)];
    const pairsSeen = roundIn(plan, 'ev-A', 1)
      .map((m) =>
        [m.srcA, m.srcB]
          .map((s) => letter((s as { entryId: ID }).entryId))
          .sort()
          .join('–'),
      )
      .sort();
    expect(pairsSeen).toEqual(['A–C', 'A–C', 'A–C', 'A–C', 'B–D', 'B–D', 'B–D', 'B–D']);
  });

  describe('A/B/C/D with levels: every player lands in the flight of their level', () => {
    /** `mix` = how many A, B, C, D entries; ids e1… in that order */
    const field = (mix: number[]) => {
      const lv: number[] = mix.flatMap((k, i) => Array<number>(k).fill(4 - i));
      return { n: lv.length, levelOf: (id: ID) => lv[Number(id.slice(1)) - 1] };
    };
    const letter = (v: number) => (v >= 3.5 ? 'A' : v > 2 ? 'B' : v >= 2 ? 'C' : 'D');
    /** Play the draw out with the higher level always winning; the flight each entry finishes in. */
    function finish(plan: DrawPlan, levelOf: (id: ID) => number) {
      const win = new Map<ID, ID | 'BYE'>();
      const lose = new Map<ID, ID | 'BYE'>();
      const flight = new Map(plan.stages.map((s) => [s.id, s.flight]));
      const last = new Map<ID, string | undefined>();
      const who = (s: SlotSource): ID | 'BYE' | undefined =>
        s.kind === 'entry'
          ? s.entryId
          : s.kind === 'bye'
            ? 'BYE'
            : s.kind === 'winner'
              ? win.get(s.matchId)
              : s.kind === 'loser'
                ? lose.get(s.matchId)
                : undefined;
      for (let pass = 0; pass < 40; pass++)
        for (const m of plan.matches) {
          if (win.has(m.id)) continue;
          const [a, b] = [who(m.srcA), who(m.srcB)];
          if (a === undefined || b === undefined) continue;
          const aWins = b === 'BYE' || (a !== 'BYE' && levelOf(a) >= levelOf(b));
          win.set(m.id, aWins ? a : b);
          lose.set(m.id, aWins ? b : a);
          for (const e of [a, b]) if (e !== 'BYE') last.set(e, flight.get(m.stageId));
        }
      return last;
    }
    const wrong = (plan: DrawPlan, ids: ID[], levelOf: (id: ID) => number) => {
      const last = finish(plan, levelOf);
      return ids.filter((id) => last.get(id) !== letter(levelOf(id)));
    };
    /** Byes in a flight after its round 1 (an empty corner of the bracket). */
    const laterByes = (plan: DrawPlan, stageId: ID) =>
      plan.matches.filter((m) => m.stageId === stageId && m.round > 1 && (m.srcA.kind === 'bye' || m.srcB.kind === 'bye'));

    it.each([
      [4, 4, 4, 4],
      [6, 6, 6, 6],
      [5, 5, 5, 5],
      [12, 12, 12, 12],
    ])('A/B/C/D = %i/%i/%i/%i: nobody finishes in the wrong flight, no warnings, byes only in round 1', (...mix) => {
      const { n, levelOf } = field(mix);
      for (const pairing of ['balanced', 'classic'] as const) {
        const plan = draw('drop_flight', n, { pairing }, { levelOf, seeds: bwfSeedCount(n) });
        expect(wrong(plan, entryIds(n), levelOf), pairing).toEqual([]);
        expect(plan.warnings, pairing).toEqual([]);
        for (const st of ['ev-A', 'ev-C']) expect(laterByes(plan, st), `${pairing} ${st}`).toEqual([]);
      }
    });

    it.each([
      [7, 12, 17, 12],
      [3, 5, 6, 4],
      [10, 6, 6, 10],
      [2, 3, 6, 6],
    ])('A/B/C/D = %i/%i/%i/%i: still no byes after round 1 in flights A and C', (...mix) => {
      const { n, levelOf } = field(mix);
      const plan = draw('drop_flight', n, {}, { levelOf });
      expect(laterByes(plan, 'ev-A')).toEqual([]);
      expect(laterByes(plan, 'ev-C')).toEqual([]);
    });

    it('48 players, 12 per level: 16 round-1 byes; some players play their first two matches in rounds 2 and 3', () => {
      const { n, levelOf } = field([12, 12, 12, 12]);
      const plan = draw('drop_flight', n, {}, { levelOf });
      const r1 = roundIn(plan, 'ev-A', 1);
      expect(r1.filter((m) => !isReal(m))).toHaveLength(16);
      // every C/D player's first match is against an A/B player: none of them meet in round 1
      const low = (s: SlotSource) => s.kind === 'entry' && levelOf(s.entryId) <= 2;
      expect(r1.filter((m) => low(m.srcA) && low(m.srcB))).toEqual([]);
      // flight B also takes losers from round 3: B players with a round-1 bye lose their second match there
      const bFeeders = plan.matches.filter((m) => m.loserTo === 'B flight');
      expect(new Set(bFeeders.map((m) => m.round))).toEqual(new Set([2, 3]));
    });

    it('the real Men’s Singles mix (7 A, 12 B, 17 C, 12 D): close to the 3 misses the numbers force, with a warning', () => {
      // 7 A and 12 B can take at most 2×7 + 12 = 26 of the 29 C/D players in their first match
      const { n, levelOf } = field([7, 12, 17, 12]);
      const plan = draw('drop_flight', n, {}, { levelOf, seeds: 8 });
      // the layout is found by search: the minimum (3) almost always, never more than one above it
      const bad = wrong(plan, entryIds(n), levelOf).length;
      expect(bad).toBeGreaterThanOrEqual(3);
      expect(bad).toBeLessThanOrEqual(4);
      expect(plan.warnings.join(' ')).toMatch(new RegExp(`${bad} players are expected to finish outside their level's flight`));
    });

    it('top seeds get the round-1 byes where that costs nobody their flight', () => {
      // 48 players, 12 per level, 8 seeds: 4 A players can have a bye (each meets a C/D bye holder in round 2)
      const { n, levelOf } = field([12, 12, 12, 12]);
      const plan = draw('drop_flight', n, {}, { levelOf, seeds: 8 });
      const holders = roundIn(plan, 'ev-A', 1)
        .filter((m) => (m.srcA.kind === 'bye') !== (m.srcB.kind === 'bye'))
        .flatMap((m) => [m.srcA, m.srcB].flatMap((x) => (x.kind === 'entry' ? [x.entryId] : [])));
      expect(['e1', 'e2', 'e3', 'e4'].every((s) => holders.includes(s))).toBe(true);
      expect(wrong(plan, entryIds(n), levelOf)).toEqual([]);
    });

    it('a loser goes to C after their first match, to B after their second, and is out after that', () => {
      const { n, levelOf } = field([12, 12, 12, 12]);
      const plan = draw('drop_flight', n, {}, { levelOf });
      const a = plan.matches.filter((m) => m.stageId === 'ev-A' && isReal(m));
      expect(a.some((m) => m.loserTo === 'C flight')).toBe(true);
      expect(a.some((m) => m.loserTo === 'B flight')).toBe(true);
      // the final and semi-finals are between players who have played twice already: their losers are out
      expect(roundIn(plan, 'ev-A', 6).every((m) => !m.loserTo)).toBe(true);
    });

    it('the draw editor rebuilds the same draw from its lines', () => {
      const { n, levelOf } = field([7, 12, 17, 12]);
      const plan = draw('drop_flight', n, {}, { levelOf });
      const lines = roundIn(plan, 'ev-A', 1).flatMap((m) =>
        [m.srcA, m.srcB].map((x) => (x.kind === 'entry' ? x.entryId : ('BYE' as const))),
      );
      const ids = lines.filter((x): x is ID => x !== 'BYE');
      const again = draw('drop_flight', n, {}, { levelOf, lines, entryIds: ids });
      const shape = (p: DrawPlan) => p.matches.map((m) => [m.id, m.loserTo ?? '']).sort();
      expect(wrong(again, entryIds(n), levelOf)).toEqual(wrong(plan, entryIds(n), levelOf));
      expect(again.stages.map((s) => [s.flight, s.size])).toEqual(plan.stages.map((s) => [s.flight, s.size]));
      expect(shape(again).filter(([id]) => id.startsWith('ev-A'))).toEqual(shape(plan).filter(([id]) => id.startsWith('ev-A')));
    });
  });

  it('round robin, 16 entries with 4 of each level → every group gets one player of each level', () => {
    const lv = (id: ID) => LEVEL_VALUE[LETTERS[(Number(id.slice(1)) - 1) % 4]];
    const plan = draw('round_robin', 16, { pairing: 'balanced', groupSize: 4, advance: 0 }, { levelOf: lv, clubOf: (id) => `C-${id}` });
    expect(plan.groups).toHaveLength(4);
    for (const g of plan.groups) expect(g.entryIds.map(lv).sort()).toEqual([1, 2, 3, 4]);
  });

  it('round robin moves clubmates of the same strength into different groups', () => {
    // 8 entries, 2 groups; e1/e2 are the two A players and share a club → the snake puts them in different groups anyway;
    // e1 and e4 (A and B) share a club and snake together → separation must move one of them.
    const lv = (id: ID) => [4, 4, 3, 3, 2, 2, 1, 1][Number(id.slice(1)) - 1];
    const club = (id: ID) => (id === 'e1' || id === 'e4' ? 'X' : `C-${id}`);
    const plan = draw('round_robin', 8, { pairing: 'balanced', groupSize: 4, advance: 0 }, { levelOf: lv, clubOf: club, rngSeed: 7 });
    const groupOf = (id: ID) => plan.groups.findIndex((g) => g.entryIds.includes(id));
    expect(groupOf('e1')).not.toBe(groupOf('e4'));
    expect(plan.groups.map((g) => g.entryIds.length)).toEqual([4, 4]);
  });
});

describe('drop flight laid out like tournamentsoftware (Triple Plate)', () => {
  // the real Men's Singles: 64 lines, 49 players; P = player, b = bye (pairs of lines are round-1 matches)
  const PATTERN = 'Pb Pb PP Pb PP bP PP PP PP Pb Pb Pb PP PP PP PP Pb Pb Pb Pb PP PP PP PP Pb Pb Pb Pb PP PP PP PP';
  const lines: (ID | 'BYE')[] = [];
  let n = 0;
  for (const ch of PATTERN.replace(/ /g, '')) lines.push(ch === 'P' ? `e${++n}` : 'BYE');
  const plan = draw('drop_flight', n, { variant: 'ABCD', layout: 'tournamentsoftware' }, { entryIds: entryIds(n), lines });
  const stage = (f: string) => plan.stages.find((s) => s.flight === f)!;
  const a1 = roundIn(plan, stage('A').id, 1);

  it('keeps all four flights at tournamentsoftware sizes: Main 64, Plate 32, Special Plate 32, Consolation Plate 16', () => {
    expect(plan.stages.map((s) => s.flight)).toEqual(['A', 'B', 'C', 'D']);
    expect(stageSizes(plan)).toEqual({ A: 64, B: 32, C: 32, D: 16 });
  });

  it('Plate lines follow the first-round matches; Special Plate pairs round-2 and (mirrored) round-3 losers', () => {
    const b = round1Lines(plan, stage('B').id);
    a1.forEach((m, i) => expect(b[i]).toEqual({ kind: 'drop', matchId: m.id, nth: 1 }));
    // the site: Thomas Pate (lost round-3 match 2) on line 21 against Kunal Suresh (lost round-2 match 10) on line 22
    const c = round1Lines(plan, stage('C').id);
    const r2m = roundIn(plan, stage('A').id, 2);
    const r3m = roundIn(plan, stage('A').id, 3);
    const M = r2m.length;
    r2m.forEach((m, j) => {
      expect(c[2 * j + 1]).toEqual({ kind: 'loser', matchId: m.id, nth: 2 });
      const k = j % 2 === 0 ? (M - 2 - j) / 2 : -1;
      expect(c[2 * j]).toEqual(k >= 0 ? { kind: 'loser', matchId: r3m[k].id, nth: 2 } : { kind: 'bye' });
    });
    expect(c[20]).toEqual({ kind: 'loser', matchId: r3m[2].id, nth: 2 });
    expect(c[21]).toEqual({ kind: 'loser', matchId: r2m[10].id, nth: 2 });
    const b1 = roundIn(plan, stage('B').id, 1);
    round1Lines(plan, stage('D').id).forEach((s, j) => expect(s).toEqual({ kind: 'drop', matchId: b1[j].id, nth: 1 }));
  });

  describe('who drops where, as results come in (the real Day 1 cases)', () => {
    const ctx = { groups: [], rulesFor: () => RULES.BWF_3x21 };
    let ms = resolveMatches(plan.matches, ctx);
    const find = (id: ID) => ms.find((m) => m.id === id)!;
    /** The winner of match `id` is the side holding `entry`. */
    const win = (id: ID, entry: ID) => {
      const m = find(id);
      const side = m.a === entry ? 'a' : 'b';
      ms = resolveMatches(
        ms.map((x) =>
          x.id === id
            ? {
                ...x,
                status: 'finished',
                winner: side,
                result: 'normal',
                games:
                  side === 'a'
                    ? [
                        [21, 10],
                        [21, 10],
                      ]
                    : [
                        [10, 21],
                        [10, 21],
                      ],
              }
            : x,
        ),
        ctx,
      );
    };
    const r2 = () => roundIn({ ...plan, matches: ms }, stage('A').id, 2);
    const bLines = () => roundIn({ ...plan, matches: ms }, stage('B').id, 1).flatMap((m) => [m.a, m.b]);
    const cLines = () => roundIn({ ...plan, matches: ms }, stage('C').id, 1).flatMap((m) => [m.a, m.b]);

    // A line pairs (round-1 matches): #1 e1 v bye · #2 e2 v bye · #3 e3 v e4 …
    it('a round-1 loser drops to the Plate on their match’s line', () => {
      win(a1[2].id, 'e3');
      expect(bLines()[2]).toBe('e4');
    });

    it('a player with a round-1 bye who loses in round 2 drops to the Plate too, on their own line (Kapelevich)', () => {
      // round 2 match 1: e1 (bye) v e2 (bye) – both are playing their first match
      win(r2()[0].id, 'e1');
      expect(bLines()[1]).toBe('e2');
      expect(bLines()[0]).toBe('BYE'); // e1 won their first match: never drops here
    });

    it('a round-1 winner who loses in round 2 drops to the Special Plate (their second match)', () => {
      // round 2 match 2: e3 (won round 1) v e5 (bye)
      const m = r2()[1];
      expect([m.a, m.b].sort()).toEqual(['e3', 'e5']);
      win(m.id, 'e5');
      expect(cLines()[3]).toBe('e3'); // second match lost in round-2 match 1 → Special Plate match 1, second line
      expect(bLines()).not.toContain('e3'); // never in the Plate: their first match was a win
    });

    it('a bye in round 1, a win in round 2 and a loss in round 3 is a second-match loss: Special Plate, mirrored (Thomas Pate)', () => {
      // e1 won round-2 match 0; round-3 match 0: e1 v e5 (winner of round-2 match 1)
      const r3 = ms.find((m) => m.stageId === stage('A').id && m.round === 3 && m.index === 0)!;
      expect([r3.a, r3.b].sort()).toEqual(['e1', 'e5']);
      win(r3.id, 'e5');
      // k = 0 → Special Plate match M - 2 - 0 = 14, first line
      expect(cLines()[28]).toBe('e1');
    });

    it('a Plate player losing their first Plate match drops to the Consolation Plate', () => {
      const b1 = roundIn({ ...plan, matches: ms }, stage('B').id, 1);
      const pair = b1.find((m) => m.a === 'e2' || m.b === 'e2')!;
      // e2 (line 2) v e1's line (a bye) → e2 goes through; their first Plate match is later. Give them one now:
      expect(pair.status).toBe('bye');
      const dLines = () => roundIn({ ...plan, matches: ms }, stage('D').id, 1).flatMap((m) => [m.a, m.b]);
      const next = ms.find((m) => m.stageId === stage('B').id && m.round === 2 && (m.a === 'e2' || m.b === 'e2'))!;
      const other = next.a === 'e2' ? next.b : next.a;
      if (other && other !== 'BYE') {
        win(next.id, other);
        expect(dLines()).toContain('e2');
      }
    });
  });

  it('keeps the flights even when almost every first-round line is a bye (the real Men’s Doubles)', () => {
    const md: (ID | 'BYE')[] = [];
    let k = 0;
    for (let i = 0; i < 32; i++) md.push(`e${++k}`, i === 29 ? `e${++k}` : 'BYE');
    const p = draw('drop_flight', k, { variant: 'ABCD', layout: 'tournamentsoftware' }, { entryIds: entryIds(k), lines: md });
    expect(p.stages.map((s) => s.flight)).toEqual(expect.arrayContaining(['A', 'C']));
    expect(p.warnings.join(' ')).not.toMatch(/uses A\/B instead/);
  });
});
