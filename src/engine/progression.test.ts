import { describe, expect, it } from 'vitest';

import { bwfSeedCount, generateDraw } from './draws';
import { assignNumbers, blockingDependents, dependents, type ResolveContext, resolveMatches } from './progression';
import { hashString, mulberry32 } from './rng';
import { checkMatch, RULES } from './rules';
import { computeStandings } from './standings';
import type { DrawPlan, EventConfig, GameScore, ID, Match, Mode, Side, Stage, TEvent } from './types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const R = RULES.BWF_3x21;
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

/** Draw with the BWF default number of seeds. */
function draw(mode: Mode, n: number, config: Partial<EventConfig> = {}): DrawPlan {
  return generateDraw({
    event: makeEvent(mode, config),
    entryIds: entryIds(n),
    seeds: Math.min(bwfSeedCount(n), n),
    rngSeed: 1000 + n,
    clubOf: () => undefined,
  });
}

const ctxOf = (plan: DrawPlan): ResolveContext => ({ groups: plan.groups, rulesFor: () => R });

/** A valid random BWF 3×21 result: straight games or three games. */
function randomResult(rand: () => number): { winner: Side; games: GameScore[] } {
  const winner: Side = rand() < 0.5 ? 'a' : 'b';
  const loser: Side = winner === 'a' ? 'b' : 'a';
  const game = (w: Side): GameScore => {
    const lo = Math.floor(rand() * 20); // 0..19
    return w === 'a' ? [21, lo] : [lo, 21];
  };
  const games = rand() < 0.6 ? [game(winner), game(winner)] : [game(winner), game(loser), game(winner)];
  return { winner, games };
}

/** Resolve, then keep finishing every ready match with a random result until nothing is ready. */
function simulate(plan: DrawPlan, seed = 1, start: Match[] = plan.matches): Match[] {
  const rand = mulberry32(seed);
  const ctx = ctxOf(plan);
  let ms = resolveMatches(start, ctx);
  for (let clock = 1; clock < 1000; clock++) {
    if (!ms.some((m) => m.status === 'ready')) return ms;
    ms = resolveMatches(
      ms.map((m): Match =>
        m.status === 'ready' ? { ...m, status: 'finished', result: 'normal', ...randomResult(rand), finishedAt: clock } : m,
      ),
      ctx,
    );
  }
  throw new Error('simulation did not settle');
}

const isEntry = (s: Match['a']): s is ID => !!s && s !== 'BYE';
const winnerOf = (m: Match): ID | undefined => (m.winner ? (m[m.winner] as ID) : undefined);
const loserOf = (m: Match): ID | undefined => (m.winner ? (m[m.winner === 'a' ? 'b' : 'a'] as ID) : undefined);
const involves = (m: Match, id: ID) => m.a === id || m.b === id;
const played = (ms: Match[], id: ID) => ms.filter((m) => m.status === 'finished' && involves(m, id)).length;
const inStage = (ms: Match[], stage: Stage) => ms.filter((m) => m.stageId === stage.id);
const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;
const flightsOf = (plan: DrawPlan) => plan.stages.map((s) => s.flight ?? s.name).join(',');
const round1 = (ms: Match[], stageId: ID) => ms.filter((m) => m.stageId === stageId && m.round === 1);
/** Entries that got a bye in round 1 of the given stage. */
const round1ByeEntries = (ms: Match[], stageId: ID) =>
  round1(ms, stageId)
    .filter((m) => m.status === 'bye')
    .map(winnerOf) as ID[];

function expectSettled(ms: Match[]) {
  const open = ms.filter((m) => m.status !== 'finished' && m.status !== 'bye');
  expect(open.map((m) => `${m.id}:${m.status}`)).toEqual([]);
}

/** Every stage has at least 2 entrants, and its final crowns one entry who never lost in that stage. */
function expectOneChampion(ms: Match[], stage: Stage) {
  const sm = inStage(ms, stage);
  const finals = sm.filter((m) => m.round === stage.rounds);
  expect(finals, `${stage.name} final`).toHaveLength(1);
  const entrants = new Set(sm.flatMap((m) => [m.a, m.b]).filter(isEntry));
  expect(entrants.size, `${stage.name} entrants`).toBeGreaterThanOrEqual(2);
  const champion = winnerOf(finals[0]);
  expect(champion, `${stage.name} champion`).toBeDefined();
  expect(entrants.has(champion!)).toBe(true);
  expect(sm.filter((m) => m.status === 'finished' && loserOf(m) === champion)).toEqual([]);
}

// ---------------------------------------------------------------------------
// sanity check of the simulator itself
// ---------------------------------------------------------------------------

describe('simulator', () => {
  it('only produces valid BWF results', () => {
    const rand = mulberry32(5);
    for (let i = 0; i < 500; i++) {
      const { winner, games } = randomResult(rand);
      expect(checkMatch(games, R)).toMatchObject({ ok: true, winner });
    }
  });
});

// ---------------------------------------------------------------------------
// Drop flight
// ---------------------------------------------------------------------------

/**
 * Why an entry that played A round 1 finished an ABCD draw with only 2 matches.
 * These are the two shortfalls left by the real-losers-only lower flights:
 *  - C has byes when the number of real A round-1 losers isn't a power of two; a player
 *    who gets one plays A R1 + C R2 and is out if they lose C R2 (C R2 losers don't drop).
 *  - D is not created when C has a single real round-1 match; its loser is out after 2.
 */
function twoMatchReason(ms: Match[], plan: DrawPlan, id: ID): string | undefined {
  const c = ms.filter((m) => m.stageId === 'ev-C');
  const hadCBye = c.some((m) => m.round === 1 && m.status === 'bye' && winnerOf(m) === id);
  const cR2 = c.find((m) => m.round === 2 && m.status === 'finished' && involves(m, id));
  if (hadCBye && cR2 && loserOf(cR2) === id) return 'C round-1 bye, then lost C round 2';
  const hasD = plan.stages.some((s) => s.flight === 'D');
  if (!hasD && c.some((m) => m.round === 1 && m.status === 'finished' && loserOf(m) === id)) return 'lost C round 1, no D flight';
  return undefined;
}

describe('drop flight ABCD · full simulation', () => {
  describe.each(range(5, 40))('N=%i', (N) => {
    const plan = draw('drop_flight', N, { variant: 'ABCD' });
    const runs = [1, 2, 3].map((s) => simulate(plan, N * 100 + s));
    const byeEntries = round1ByeEntries(runs[0], 'ev-A');
    const others = entryIds(N).filter((id) => !byeEntries.includes(id));
    const fellBack = !plan.stages.some((s) => s.flight === 'C');
    const hasB = plan.stages.some((s) => s.flight === 'B');

    it('settles with every match finished or a bye, one champion per flight', () => {
      for (const ms of runs) {
        expectSettled(ms);
        for (const stage of plan.stages) expectOneChampion(ms, stage);
      }
    });

    if (!fellBack) {
      it('every entry with an A round-1 bye plays at least 2 matches', () => {
        for (const ms of runs) for (const id of byeEntries) expect(played(ms, id), id).toBeGreaterThanOrEqual(2);
      });

      it('every entry that played A round 1 plays at least 3 matches, or exactly 2 for a known reason', () => {
        for (const ms of runs) {
          for (const id of others) {
            const n = played(ms, id);
            if (n >= 3) continue;
            expect(n, id).toBe(2);
            expect(twoMatchReason(ms, plan, id), `${id} played 2`).toBeDefined();
          }
        }
      });

      if (isPow2(round1(plan.matches, 'ev-A').filter((m) => m.srcA.kind !== 'bye' && m.srcB.kind !== 'bye').length)) {
        it('real A round-1 losers fill C exactly, so everyone who played A round 1 plays at least 3', () => {
          for (const ms of runs) for (const id of others) expect(played(ms, id), id).toBeGreaterThanOrEqual(3);
        });
      }
    } else {
      it('fell back to A/B (with a warning) and keeps the A/B promise', () => {
        expect(plan.warnings.join(' ')).toMatch(/uses A\/B instead/);
        if (!hasB) return; // a single real A round-1 match: nobody to play in B (see draws.test.ts)
        for (const ms of runs) for (const id of others) expect(played(ms, id), id).toBeGreaterThanOrEqual(2);
      });
    }
  });

  it('nobody ever plays fewer than 2 matches once C exists (N=5..64, 3 runs each)', () => {
    for (const N of range(5, 64)) {
      const plan = draw('drop_flight', N, { variant: 'ABCD' });
      if (!plan.stages.some((s) => s.flight === 'C')) continue;
      for (const s of [1, 2, 3]) {
        const ms = simulate(plan, s);
        for (const id of entryIds(N)) expect(played(ms, id), `N=${N} ${id}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  describe('the remaining 2-match cases', () => {
    it('N=14 (6 real A R1 matches): C has 2 byes, given to the first two real losers', () => {
      const plan = draw('drop_flight', 14, { variant: 'ABCD' });
      expect(flightsOf(plan)).toBe('A,B,C,D');
      const ms = simulate(plan, 1);
      const cByes = round1ByeEntries(ms, 'ev-C');
      const realAR1 = round1(ms, 'ev-A')
        .filter((m) => m.status === 'finished')
        .sort((x, y) => x.index - y.index);
      expect(cByes.sort()).toEqual([loserOf(realAR1[0]), loserOf(realAR1[1])].sort());
      // with a C bye, the entry's next match is C round 2; if they lose it they are out after 2 matches
      for (const id of cByes) {
        const cR2 = ms.find((m) => m.stageId === 'ev-C' && m.round === 2 && involves(m, id))!;
        expect(cR2.status).toBe('finished');
        if (loserOf(cR2) === id) expect(played(ms, id), id).toBe(2);
        else expect(played(ms, id), id).toBeGreaterThanOrEqual(3);
      }
    });

    it('N=13 (5 real A R1 matches): no D flight, so the loser of the one real C R1 match plays 2', () => {
      const plan = draw('drop_flight', 13, { variant: 'ABCD' });
      expect(flightsOf(plan)).toBe('A,B,C');
      const ms = simulate(plan, 1);
      const realCR1 = round1(ms, 'ev-C').filter((m) => m.status === 'finished');
      expect(realCR1).toHaveLength(1);
      expect(played(ms, loserOf(realCR1[0])!)).toBe(2);
    });
  });
});

describe('drop flight AB · full simulation', () => {
  describe.each(range(3, 40))('N=%i', (N) => {
    const plan = draw('drop_flight', N, { variant: 'AB' });
    const runs = [1, 2, 3].map((s) => simulate(plan, N * 100 + s));
    const byeEntries = round1ByeEntries(runs[0], 'ev-A');
    const others = entryIds(N).filter((id) => !byeEntries.includes(id));
    const hasB = plan.stages.some((s) => s.flight === 'B');

    it('settles and crowns one champion per flight', () => {
      for (const ms of runs) {
        expectSettled(ms);
        for (const stage of plan.stages) expectOneChampion(ms, stage);
      }
    });

    if (hasB) {
      it('every entry without an A round-1 bye plays at least 2 matches', () => {
        for (const ms of runs) for (const id of others) expect(played(ms, id), id).toBeGreaterThanOrEqual(2);
      });
    } else {
      it('has no B flight only when a single A round-1 match is played (N = 2^k + 1)', () => {
        expect(isPow2(N - 1)).toBe(true);
        expect(flightsOf(plan)).toBe('A');
        expect(plan.warnings.join(' ')).toMatch(/B flight/);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Knockout with plate and 3rd place
// ---------------------------------------------------------------------------

describe('knockout with plate and 3rd place · full simulation', () => {
  it.each(range(3, 33))('N=%i', (N) => {
    const plan = draw('knockout', N, { plate: true, thirdPlace: true });
    const ms = simulate(plan, N);
    expectSettled(ms);
    for (const stage of plan.stages) expectOneChampion(ms, stage);

    const main = plan.stages.find((s) => s.name === 'Main draw')!;
    const mainMs = inStage(ms, main);
    const losses = new Map<ID, number>();
    for (const m of mainMs) if (m.status === 'finished') losses.set(loserOf(m)!, (losses.get(loserOf(m)!) ?? 0) + 1);
    for (const [id, n] of losses) expect(n, id).toBe(1);
    // everyone but the champion lost exactly once in the main draw
    expect(losses.size).toBe(N - 1);

    const r1 = mainMs.filter((m) => m.round === 1);
    const r1Losers = r1.filter((m) => m.status === 'finished').map(loserOf) as ID[];
    const plate = plan.stages.find((s) => s.name === 'Plate');
    if (r1Losers.length >= 2) {
      // the plate holds exactly the main-draw round-1 losers, and each of them plays at least 2
      expect(plate).toBeDefined();
      const plateEntrants = [
        ...new Set(
          inStage(ms, plate!)
            .flatMap((m) => [m.a, m.b])
            .filter(isEntry),
        ),
      ].sort();
      expect(plateEntrants).toEqual([...r1Losers].sort());
      const r1Byes = round1ByeEntries(ms, main.id);
      for (const id of entryIds(N).filter((x) => !r1Byes.includes(x))) expect(played(ms, id), id).toBeGreaterThanOrEqual(2);
    } else {
      expect(plate).toBeUndefined();
      expect(plan.warnings.join(' ')).toMatch(/plate/);
    }

    // the 3rd-place match, when there is one, is between the semi-final losers
    const third = ms.find((m) => m.stageId === 'ev-third');
    const semis = mainMs.filter((m) => m.round === main.rounds - 1);
    if (semis.every((m) => m.status === 'finished')) {
      expect(third).toBeDefined();
      expect([third!.a, third!.b].sort()).toEqual(semis.map(loserOf).sort());
      expect(third!.status).toBe('finished');
    } else {
      expect(third).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Round robin → knockout
// ---------------------------------------------------------------------------

describe('round robin with knockout · full simulation', () => {
  const cases = [1, 2].flatMap((advance) => range(3, 20).map((N) => ({ N, advance: advance as 1 | 2 })));

  it.each(cases)('N=$N advance=$advance', ({ N, advance }) => {
    const plan = draw('round_robin', N, { groupSize: 4, advance });
    const ms = simulate(plan, N * 10 + advance);
    expectSettled(ms);

    const ko = plan.stages.find((s) => s.kind === 'knockout');
    if (plan.groups.length * advance < 2) {
      expect(ko).toBeUndefined();
      return;
    }
    expect(ko).toBeDefined();
    expectOneChampion(ms, ko!);

    // every knockout slot fed by a group holds the entry that finished in that position
    const ranking = new Map(
      plan.groups.map((g) => [
        g.id,
        computeStandings(
          g.id,
          g.entryIds,
          ms.filter((m) => m.groupId === g.id),
          R,
        ).rows.map((r) => r.entryId),
      ]),
    );
    const r1 = inStage(ms, ko!).filter((m) => m.round === 1);
    let filled = 0;
    for (const m of r1) {
      for (const side of ['a', 'b'] as const) {
        const src = side === 'a' ? m.srcA : m.srcB;
        if (src.kind !== 'group') continue;
        expect(m[side], `${m.id}.${side}`).toBe(ranking.get(src.groupId)![src.rank - 1]);
        filled++;
      }
    }
    expect(filled).toBe(plan.groups.length * advance);

    if (advance === 2) {
      // a group's winner and runner-up start in opposite halves of the knockout
      const lineOf = (groupId: ID, rank: number) =>
        r1.flatMap((m) => [m.srcA, m.srcB]).findIndex((s) => s.kind === 'group' && s.groupId === groupId && s.rank === rank);
      for (const g of plan.groups) {
        const w = lineOf(g.id, 1);
        const ru = lineOf(g.id, 2);
        expect(w).toBeGreaterThanOrEqual(0);
        expect(ru).toBeGreaterThanOrEqual(0);
        expect(w < ko!.size / 2, `${g.name}: winner line ${w}, runner-up line ${ru}`).not.toBe(ru < ko!.size / 2);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// assignNumbers
// ---------------------------------------------------------------------------

describe('assignNumbers', () => {
  const hasByeSource = (m: Match) => m.srcA.kind === 'bye' || m.srcB.kind === 'bye';

  const plans: [string, DrawPlan][] = [
    ['knockout N=13 + plate + 3rd', draw('knockout', 13, { plate: true, thirdPlace: true })],
    ['drop flight ABCD N=21', draw('drop_flight', 21, { variant: 'ABCD' })],
    ['drop flight ABCD N=32', draw('drop_flight', 32, { variant: 'ABCD' })],
    ['drop flight AB N=11', draw('drop_flight', 11, { variant: 'AB' })],
    ['round robin N=14 advance 2', draw('round_robin', 14, { groupSize: 4, advance: 2 })],
    ['round robin N=9 advance 1', draw('round_robin', 9, { groupSize: 4, advance: 1 })],
  ];

  it.each(plans)('%s: unique consecutive numbers in chronological order', (_name, plan) => {
    const resolved = resolveMatches(plan.matches, ctxOf(plan));
    const start = 101;
    const { matches, next } = assignNumbers(resolved, plan.stages, plan.groups, start);
    const byId = new Map(matches.map((m) => [m.id, m]));

    // numbered = not already a bye and no structural bye on either side
    const numbered = matches.filter((m) => m.status !== 'bye' && !hasByeSource(m));
    expect(numbered.map((m) => m.number).sort((x, y) => x - y)).toEqual(range(start, start + numbered.length - 1));
    expect(next).toBe(start + numbered.length);
    for (const m of matches.filter((x) => !numbered.includes(x))) expect(m.number, m.id).toBe(0);

    for (const m of numbered) {
      const feeders: Match[] = [];
      for (const s of [m.srcA, m.srcB]) {
        if (s.kind === 'winner' || s.kind === 'loser') feeders.push(byId.get(s.matchId)!);
        if (s.kind === 'group') feeders.push(...matches.filter((x) => x.groupId === s.groupId));
      }
      for (const f of feeders) if (f.number > 0) expect(f.number, `${f.id} feeds ${m.id}`).toBeLessThan(m.number);
    }
  });

  it('does not number a structural bye such as "Group A winner vs bye"', () => {
    const plan = draw('round_robin', 9, { groupSize: 4, advance: 1 }); // 3 groups → 4 lines, 1 bye
    const { matches } = assignNumbers(resolveMatches(plan.matches, ctxOf(plan)), plan.stages, plan.groups, 1);
    const withBye = matches.filter(hasByeSource);
    expect(withBye).toHaveLength(1);
    expect(withBye[0].status).toBe('pending'); // still waiting for the group to finish
    expect(withBye[0].number).toBe(0);
  });

  it('numbers group matches round by round across groups', () => {
    const plan = draw('round_robin', 8, { groupSize: 4, advance: 0 });
    const { matches } = assignNumbers(resolveMatches(plan.matches, ctxOf(plan)), plan.stages, plan.groups, 1);
    const ordered = [...matches].sort((x, y) => x.number - y.number);
    // groups alternate: A m0, B m0, A m1, B m1, ...
    expect(ordered.slice(0, 4).map((m) => [m.groupId?.slice(-1), m.index])).toEqual([
      ['A', 0],
      ['B', 0],
      ['A', 1],
      ['B', 1],
    ]);
  });

  describe('after a full simulation, a match has a number exactly when it was played', () => {
    const cases: [Mode, number, Partial<EventConfig>][] = [
      ...range(2, 33).map((n): [Mode, number, Partial<EventConfig>] => ['knockout', n, { plate: true, thirdPlace: true }]),
      ...range(3, 40).map((n): [Mode, number, Partial<EventConfig>] => ['drop_flight', n, { variant: 'ABCD' }]),
      ...range(3, 40).map((n): [Mode, number, Partial<EventConfig>] => ['drop_flight', n, { variant: 'AB' }]),
      ...[0, 1, 2].flatMap((advance) =>
        range(3, 20).map((n): [Mode, number, Partial<EventConfig>] => ['round_robin', n, { groupSize: 4, advance: advance as 0 | 1 | 2 }]),
      ),
    ];

    it.each(cases)('%s N=%i %j', (mode, n, config) => {
      const plan = draw(mode, n, config);
      const { matches, next } = assignNumbers(resolveMatches(plan.matches, ctxOf(plan)), plan.stages, plan.groups, 1);
      const numberOf = new Map(matches.map((m) => [m.id, m.number]));
      const numbered = matches.filter((m) => m.number > 0);
      expect(numbered.map((m) => m.number).sort((x, y) => x - y)).toEqual(range(1, numbered.length));
      expect(next).toBe(numbered.length + 1);

      const final = simulate(plan, n, matches);
      expectSettled(final);
      for (const m of final) expect(m.status, `${m.id} (#${numberOf.get(m.id)})`).toBe(numberOf.get(m.id)! > 0 ? 'finished' : 'bye');
    });
  });
});

// ---------------------------------------------------------------------------
// dependents / blockingDependents
// ---------------------------------------------------------------------------

describe('dependents', () => {
  const finishMatch = (ms: Match[], id: ID, winner: Side, plan: DrawPlan, at = 1): Match[] =>
    resolveMatches(
      ms.map((m): Match =>
        m.id === id
          ? {
              ...m,
              status: 'finished',
              result: 'normal',
              winner,
              games:
                winner === 'a'
                  ? [
                      [21, 10],
                      [21, 10],
                    ]
                  : [
                      [10, 21],
                      [10, 21],
                    ],
              finishedAt: at,
            }
          : m,
      ),
      ctxOf(plan),
    );
  const ids = (ms: Match[]) => ms.map((m) => m.id);
  const fedBy = (ms: Match[], matchId: ID) =>
    ms.find((m) => [m.srcA, m.srcB].some((s) => (s.kind === 'winner' || s.kind === 'loser') && s.matchId === matchId))!;

  it('A round-1 result feeds the A round-2 match and its C round-1 match', () => {
    const plan = draw('drop_flight', 16, { variant: 'ABCD' });
    let ms = resolveMatches(plan.matches, ctxOf(plan));
    ms = finishMatch(ms, 'ev-A-r1-m0', 'a', plan);

    const deps = ids(dependents('ev-A-r1-m0', ms));
    expect(deps).toContain('ev-A-r2-m0');
    expect(deps).toContain('ev-C-r1-m0'); // loser of the 1st real A R1 match sits on C line 0
    expect(deps).toHaveLength(2);
    expect(blockingDependents('ev-A-r1-m0', ms)).toEqual([]);

    // once A round 2 has been played, the round-1 result is locked
    ms = finishMatch(ms, 'ev-A-r1-m1', 'a', plan);
    expect(ms.find((m) => m.id === 'ev-A-r2-m0')!.status).toBe('ready');
    ms = finishMatch(ms, 'ev-A-r2-m0', 'b', plan, 2);
    expect(ids(blockingDependents('ev-A-r1-m0', ms))).toEqual(['ev-A-r2-m0']);

    // a match on court also blocks
    ms = ms.map((m): Match => (m.id === 'ev-C-r1-m0' ? { ...m, status: 'on_court' } : m));
    expect(ids(blockingDependents('ev-A-r1-m0', ms)).sort()).toEqual(['ev-A-r2-m0', 'ev-C-r1-m0']);
  });

  it('follows byes downstream', () => {
    // N=13: 5 real A R1 matches → C has 8 lines and 3 byes. The loser of the first real
    // A R1 match gets a C bye, so their C round-2 match also depends on that result.
    const plan = draw('drop_flight', 13, { variant: 'ABCD' });
    let ms = resolveMatches(plan.matches, ctxOf(plan));
    const firstReal = round1(ms, 'ev-A')
      .filter((m) => m.status === 'ready')
      .sort((x, y) => x.index - y.index)[0];
    ms = finishMatch(ms, firstReal.id, 'a', plan);
    const cR1 = ms.find((m) => m.stageId === 'ev-C' && m.srcA.kind === 'loser' && m.srcA.matchId === firstReal.id)!;
    expect(cR1.status).toBe('bye');
    expect(cR1.a).toBe(firstReal.b);
    const cR2 = fedBy(ms, cR1.id);
    expect(cR2.stageId).toBe('ev-C');
    expect(cR2.round).toBe(2);

    const deps = ids(dependents(firstReal.id, ms));
    expect(deps).toEqual(expect.arrayContaining([fedBy(ms, firstReal.id).id, cR1.id, cR2.id]));
  });

  it('a group match feeds every knockout slot taken from that group', () => {
    const plan = draw('round_robin', 8, { groupSize: 4, advance: 2 });
    const ms = resolveMatches(plan.matches, ctxOf(plan));
    const groupA = plan.groups[0];
    const firstA = ms.find((m) => m.groupId === groupA.id)!;
    const fed = ms.filter((m) => [m.srcA, m.srcB].some((s) => s.kind === 'group' && s.groupId === groupA.id));
    expect(fed.length).toBeGreaterThan(0);
    expect(ids(dependents(firstA.id, ms)).sort()).toEqual(ids(fed).sort());
  });
});

// ---------------------------------------------------------------------------
// Level-aware draws (levelOf + pairing): full simulations still complete
// ---------------------------------------------------------------------------

describe('level-aware draws · full simulation', () => {
  const levelOf = (id: ID) => 1 + (hashString(`lvl:${id}`) % 4);
  const clubOf = (id: ID) => `Club${hashString(`club:${id}`) % 5}`;
  type Pairing = NonNullable<EventConfig['pairing']>;
  const drawL = (mode: Mode, n: number, config: Partial<EventConfig>, pairing: Pairing) =>
    generateDraw({
      event: makeEvent(mode, { ...config, pairing }),
      entryIds: entryIds(n),
      seeds: Math.min(bwfSeedCount(n), n),
      rngSeed: 2000 + n,
      clubOf,
      levelOf,
    });

  const modes: [string, Mode, Partial<EventConfig>, number[]][] = [
    ['knockout + plate + 3rd', 'knockout', { plate: true, thirdPlace: true }, range(2, 40)],
    ['drop flight ABCD', 'drop_flight', { variant: 'ABCD' }, range(5, 40)],
    ['drop flight AB', 'drop_flight', { variant: 'AB' }, range(3, 40)],
    ['round robin → knockout', 'round_robin', { groupSize: 4, advance: 2 }, range(3, 24)],
  ];

  describe.each(['balanced', 'classic', 'random'] as const)('%s pairing', (pairing) => {
    describe.each(modes)('%s', (_label, mode, config, sizes) => {
      it.each(sizes)('N=%i completes; numbered matches are exactly the ones played', (n) => {
        const plan = drawL(mode, n, config, pairing);
        const { matches } = assignNumbers(resolveMatches(plan.matches, ctxOf(plan)), plan.stages, plan.groups, 1);
        const numberOf = new Map(matches.map((m) => [m.id, m.number]));
        const ms = simulate(plan, n, matches);
        expectSettled(ms);
        for (const stage of plan.stages.filter((s) => s.kind === 'knockout')) expectOneChampion(ms, stage);
        for (const m of ms) expect(m.status, m.id).toBe(numberOf.get(m.id)! > 0 ? 'finished' : 'bye');
        // every entry plays at least once and appears in exactly one first-round slot
        for (const id of entryIds(n)) expect(played(ms, id), id).toBeGreaterThanOrEqual(1);
        const firstStage = plan.stages[0];
        const slots =
          firstStage.kind === 'group'
            ? plan.groups.flatMap((g) => g.entryIds)
            : round1(ms, firstStage.id)
                .flatMap((m) => [m.a, m.b])
                .filter(isEntry);
        expect([...slots].sort()).toEqual(entryIds(n).sort());
      });
    });
  });
});

// ---------------------------------------------------------------------------
// resolveMatches basics
// ---------------------------------------------------------------------------

describe('resolveMatches', () => {
  it('is pure: the input matches are not mutated', () => {
    const plan = draw('knockout', 6, { thirdPlace: true });
    const snapshot = JSON.stringify(plan.matches);
    resolveMatches(plan.matches, ctxOf(plan));
    expect(JSON.stringify(plan.matches)).toBe(snapshot);
  });

  it('auto-advances byes and marks known pairings ready', () => {
    const plan = draw('knockout', 6, { thirdPlace: false });
    const ms = resolveMatches(plan.matches, ctxOf(plan));
    const r1 = ms.filter((m) => m.round === 1);
    expect(r1.filter((m) => m.status === 'bye')).toHaveLength(2);
    expect(r1.filter((m) => m.status === 'ready')).toHaveLength(2);
    // seed 1 (line 0) got the bye and already sits in the semi-final
    expect(ms.find((m) => m.id === 'ev-main-r2-m0')!.a).toBe('e1');
    expect(ms.find((m) => m.id === 'ev-main-r2-m0')!.status).toBe('pending');
  });

  it('leaves group-fed knockout slots empty until the group is complete', () => {
    const plan = draw('round_robin', 8, { groupSize: 4, advance: 2 });
    const ms = resolveMatches(plan.matches, ctxOf(plan));
    const ko = ms.filter((m) => !m.groupId);
    expect(ko.every((m) => m.status === 'pending' && m.a === null && m.b === null)).toBe(true);
  });
});
