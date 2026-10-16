import { describe, expect, it } from 'vitest';

import { generateDraw, roundName } from './draws';
import { LEVEL_VALUE } from './pairing';
import type { DrawPlan, ID, Match, SlotSource, TEvent } from './types';

const event: TEvent = {
  id: 'ev',
  tournamentId: 't1',
  kind: 'MS',
  name: 'Test event',
  fee: 0,
  cap: 128,
  rules: 'BWF_3x21',
  mode: 'drop_flight',
  config: { groupSize: 4, advance: 2, variant: 'PLACEMENT', thirdPlace: false, plate: false, seeds: 0 },
  drawState: 'none',
};

const levelOf = (id: ID) => LEVEL_VALUE[id[0]];

/** Entries named by level ("A1", "C2"…), in rank order; all seeded so the order is exactly this. */
const make = (
  ids: ID[],
  clubOf: (id: ID) => string | undefined = () => undefined,
  seeds = ids.length,
  config: Partial<TEvent['config']> = {},
) => generateDraw({ event: { ...event, config: { ...event.config, ...config } }, entryIds: ids, seeds, rngSeed: 3, clubOf, levelOf });
type Byes = NonNullable<TEvent['config']['placementByes']>;
/** Entries who skip round 1 (a round-1 bye). */
const r1Byes = (plan: DrawPlan) =>
  plan.matches
    .filter((m) => plan.stages.find((s) => s.id === m.stageId)?.name === 'Round 1' && (m.srcA.kind === 'bye' || m.srcB.kind === 'bye'))
    .flatMap((m) => [m.srcA, m.srcB].flatMap((x) => (x.kind === 'entry' ? [x.entryId] : [])));

const stage = (plan: DrawPlan, name: string) => plan.stages.find((s) => s.name === name)!;
const inStage = (plan: DrawPlan, name: string) => plan.matches.filter((m) => m.stageId === stage(plan, name).id);

/** Play everything out; `beats` lists upsets as [winner, loser], otherwise the stronger player (then the better rank) wins. */
function play(plan: DrawPlan, ranking: ID[], beats: [ID, ID][] = []) {
  const winnerOf = new Map<ID, ID | 'BYE'>();
  const loserOf = new Map<ID, ID | 'BYE'>();
  const who = (s: SlotSource): ID | 'BYE' | null =>
    s.kind === 'entry'
      ? s.entryId
      : s.kind === 'bye'
        ? 'BYE'
        : s.kind === 'winner'
          ? (winnerOf.get(s.matchId) ?? null)
          : s.kind === 'loser'
            ? (loserOf.get(s.matchId) ?? null)
            : null;
  const pairs = new Map<ID, [ID | 'BYE', ID | 'BYE']>();
  for (let progress = true; progress;) {
    progress = false;
    for (const m of plan.matches) {
      if (winnerOf.has(m.id)) continue;
      const a = who(m.srcA);
      const b = who(m.srcB);
      if (a === null || b === null) continue;
      progress = true;
      pairs.set(m.id, [a, b]);
      if (a === 'BYE' || b === 'BYE') {
        winnerOf.set(m.id, a === 'BYE' ? b : a);
        loserOf.set(m.id, 'BYE');
        continue;
      }
      const upset = beats.find(([w, l]) => (w === a && l === b) || (w === b && l === a));
      const [w, l] = upset ?? (ranking.indexOf(a) < ranking.indexOf(b) ? [a, b] : [b, a]);
      winnerOf.set(m.id, w);
      loserOf.set(m.id, l);
    }
  }
  const games = (name: string) =>
    inStage(plan, name)
      .map((m: Match) => pairs.get(m.id)!)
      .filter(([a, b]) => a !== 'BYE' && b !== 'BYE')
      // better-ranked first, in rank order (the layout order is checked separately)
      .map(([a, b]) => (ranking.indexOf(a) < ranking.indexOf(b) ? `${a}-${b}` : `${b}-${a}`))
      .sort((x, y) => ranking.indexOf(x.split('-')[0]) - ranking.indexOf(y.split('-')[0]));
  const flight = (label: string) => {
    const st = plan.stages.find((s) => s.flight === label);
    if (!st) return [];
    return [...new Set(plan.matches.filter((m) => m.stageId === st.id && m.round === 1).flatMap((m) => pairs.get(m.id)!))]
      .filter((x) => x !== 'BYE')
      .sort();
  };
  return { games, flight };
}

const FIELD = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];

describe('drop flight by results (placement rounds)', () => {
  it('8 entries, no upsets: round 1 top v bottom half, round 2 A v B and C v D, flights by level', () => {
    const plan = make(FIELD);
    const r = play(plan, FIELD);
    expect(r.games('Round 1')).toEqual(['A1-C1', 'A2-C2', 'B1-D1', 'B2-D2']);
    expect(r.games('Round 2 upper')).toEqual(['A1-B1', 'A2-B2']);
    expect(r.games('Round 2 lower')).toEqual(['C1-D1', 'C2-D2']);
    expect([r.flight('A'), r.flight('B'), r.flight('C'), r.flight('D')]).toEqual([
      ['A1', 'A2'],
      ['B1', 'B2'],
      ['C1', 'C2'],
      ['D1', 'D2'],
    ]);
  });

  it('an upset moves the winner up and the loser down; the draw itself stays as published', () => {
    const plan = make(FIELD);
    const r = play(plan, FIELD, [['D1', 'B1']]);
    // D1 takes B1's place (fixed draw: B1's round-2 slot), B1 takes D1's
    expect(r.games('Round 2 upper')).toEqual(['A1-D1', 'A2-B2']);
    expect(r.games('Round 2 lower')).toEqual(['B1-C1', 'C2-D2']);
  });

  it.each(([8, 9, 13, 16, 31, 48] as const).flatMap((n) => (['round1', 'round2', 'flights'] as Byes[]).map((b) => [n, b] as const)))(
    '%i entries, byes %s: round 1 never pairs two from the same half; round 2 never crosses groups',
    (n, placementByes) => {
      const ids = Array.from({ length: n }, (_, i) => `${'ABCD'[Math.floor((i * 4) / n)]}${i + 1}`);
      const plan = make(ids, undefined, n, { placementByes });
      const r = play(plan, ids);
      const byes = r1Byes(plan);
      // round-1 byes are the very top of the list
      expect(byes).toEqual(expect.arrayContaining(ids.slice(0, byes.length)));
      const rest = ids.slice(byes.length);
      const topHalf = new Set(rest.slice(0, rest.length / 2));
      for (const g of r.games('Round 1')) {
        const [a, b] = g.split('-');
        expect(topHalf.has(a) !== topHalf.has(b)).toBe(true);
      }
      const upperIds = new Set(
        r
          .games('Round 1')
          .map((g) => g.split('-')[0])
          .concat(byes),
      );
      for (const g of r.games('Round 2 upper')) expect(g.split('-').every((x) => upperIds.has(x))).toBe(true);
      for (const g of r.games('Round 2 lower')) expect(g.split('-').some((x) => upperIds.has(x))).toBe(false);
      // nobody ends in two flights (a flight of one player has no matches, so it isn't listed)
      const flights = ['A', 'B', 'C', 'D'].flatMap((f) => r.flight(f));
      expect(new Set(flights).size).toBe(flights.length);
      expect(flights.length).toBeGreaterThanOrEqual(n - 4);
    },
  );

  it('"Ranked order" pairs 1 v N in round 1 (A v D, B v C) and in round 2; the flights come out the same', () => {
    const plan = generateDraw({
      event: { ...event, config: { ...event.config, pairing: 'classic' } },
      entryIds: FIELD,
      seeds: 8,
      rngSeed: 3,
      clubOf: () => undefined,
      levelOf,
    });
    const r = play(plan, FIELD);
    expect(r.games('Round 1')).toEqual(['A1-D2', 'A2-D1', 'B1-C2', 'B2-C1']);
    expect(r.games('Round 2 upper')).toEqual(['A1-B2', 'A2-B1']);
    expect(r.games('Round 2 lower')).toEqual(['C1-D2', 'C2-D1']);
    expect([r.flight('A'), r.flight('B'), r.flight('C'), r.flight('D')]).toEqual([
      ['A1', 'A2'],
      ['B1', 'B2'],
      ['C1', 'C2'],
      ['D1', 'D2'],
    ]);
  });

  it('gives the top seed a bye (as a win) when a group is odd', () => {
    const ids = ['A1', 'A2', 'B1', 'C1', 'C2', 'D1', 'D2'];
    const plan = make(ids);
    const r1 = inStage(plan, 'Round 1');
    expect(r1[0].srcA).toEqual({ kind: 'entry', entryId: 'A1' });
    expect(r1[0].srcB).toEqual({ kind: 'bye' });
    const r = play(plan, ids);
    expect(r.games('Round 1')).toEqual(['A2-C2', 'B1-D1', 'C1-D2']);
  });

  it('keeps clubmates apart in round 1 when it can (pairs stay top v bottom)', () => {
    const club: Record<ID, string> = { A1: 'X', C1: 'X' };
    const plan = make(FIELD, (id) => club[id]);
    const r = play(plan, FIELD);
    expect(r.games('Round 1')).not.toContain('A1-C1');
    expect(r.games('Round 1').every((g) => g.split('-')[0] < 'C')).toBe(true);
  });

  it('lays round 1 out in seed positions (seed 1 top, seed 2 bottom), and the editor rebuilds the same draw', () => {
    const ids = Array.from({ length: 16 }, (_, i) => `${'ABCD'[Math.floor(i / 4)]}${(i % 4) + 1}`);
    const plan = make(ids);
    const byIndex = (name: string) => [...inStage(plan, name)].sort((a, b) => a.index - b.index);
    const r1 = byIndex('Round 1');
    const entry = (src: SlotSource) => (src.kind === 'entry' ? src.entryId : '');
    expect(entry(r1[0].srcA)).toBe('A1');
    expect([entry(r1[r1.length - 1].srcA), entry(r1[r1.length - 1].srcB)]).toContain('A2');
    // the published layout rebuilds the same draw (draw editor round trip)
    const lines = r1.flatMap((m) => [m.srcA, m.srcB].map((x) => (x.kind === 'entry' ? x.entryId : ('BYE' as const))));
    const again = generateDraw({ event, entryIds: ids, seeds: 16, rngSeed: 9, clubOf: () => undefined, levelOf, lines });
    expect(again.matches.map((m) => [m.id, m.index, m.srcA, m.srcB])).toEqual(plan.matches.map((m) => [m.id, m.index, m.srcA, m.srcB]));
  });

  it('follows the seeding order as given, not re-sorted by level', () => {
    // organizer put C1 above B1 in the seeding order
    const ids = ['A1', 'A2', 'C1', 'B1', 'B2', 'C2', 'D1', 'D2'];
    const r = play(make(ids, undefined, 0), ids);
    expect(r.games('Round 1')).toEqual(['A1-B2', 'A2-C2', 'C1-D1', 'B1-D2']);
  });

  it('48 entries (12 per level), byes in round 1 (default): the top 16 skip round 1; flights 16/16/8/8 with no byes', () => {
    const ids = Array.from({ length: 48 }, (_, i) => `${'ABCD'[Math.floor(i / 12)]}${(i % 12) + 1}`);
    const plan = make(ids);
    expect(r1Byes(plan).sort()).toEqual(ids.slice(0, 16).sort());
    expect(inStage(plan, 'Round 1').filter((m) => m.srcA.kind !== 'bye' && m.srcB.kind !== 'bye')).toHaveLength(16);
    expect(inStage(plan, 'Round 2 upper')).toHaveLength(16);
    expect(inStage(plan, 'Round 2 lower')).toHaveLength(8);
    expect(plan.stages.filter((s) => s.flight).map((s) => s.size)).toEqual([16, 16, 8, 8]);
    const flightMatches = plan.matches.filter((m) => plan.stages.find((s) => s.id === m.stageId)?.flight);
    expect(flightMatches.some((m) => m.srcA.kind === 'bye' || m.srcB.kind === 'bye')).toBe(false);
    // bye holders are spread in seed positions: seed 1 top, seed 2 bottom
    const r1 = [...inStage(plan, 'Round 1')].sort((a, b) => a.index - b.index);
    expect(r1[0].srcA).toEqual({ kind: 'entry', entryId: 'A1' });
    expect(r1[r1.length - 1].srcA).toEqual({ kind: 'entry', entryId: 'A2' });
  });

  it('48 entries, byes in the flights: everyone plays both placement rounds; flights of 12 with 4 byes in Round 1', () => {
    const ids = Array.from({ length: 48 }, (_, i) => `${'ABCD'[Math.floor(i / 12)]}${(i % 12) + 1}`);
    const plan = make(ids, undefined, 48, { placementByes: 'flights' });
    expect(r1Byes(plan)).toEqual([]);
    expect(inStage(plan, 'Round 2 upper')).toHaveLength(12);
    expect(plan.stages.filter((s) => s.flight).map((s) => s.size)).toEqual([16, 16, 16, 16]);
    const r = play(plan, ids);
    expect([r.flight('A'), r.flight('B'), r.flight('C'), r.flight('D')].map((f) => new Set(f.map((x) => x[0])))).toEqual([
      new Set('A'),
      new Set('B'),
      new Set('C'),
      new Set('D'),
    ]);
  });

  it('48 entries (12 per level), byes in round 2: the top 8 of each group skip round 2, flights 16/8/16/8 with no byes', () => {
    const ids = Array.from({ length: 48 }, (_, i) => `${'ABCD'[Math.floor(i / 12)]}${(i % 12) + 1}`);
    const plan = make(ids, undefined, 48, { placementByes: 'round2' });
    expect(inStage(plan, 'Round 1')).toHaveLength(24);
    expect(inStage(plan, 'Round 2 upper')).toHaveLength(8);
    expect(inStage(plan, 'Round 2 lower')).toHaveLength(8);
    expect(plan.stages.filter((s) => s.flight).map((s) => s.size)).toEqual([16, 8, 16, 8]);
    const flightMatches = plan.matches.filter((m) => plan.stages.find((s) => s.id === m.stageId)?.flight);
    expect(flightMatches.some((m) => m.srcA.kind === 'bye' || m.srcB.kind === 'bye')).toBe(false);
    // the round-2 byes go to the best-ranked of each group: A1–A8 straight into Flight A, C1–C8 into Flight C
    const r = play(plan, ids);
    expect(r.games('Round 2 upper').flatMap((g) => g.split('-'))).not.toContain('A1');
    expect(r.flight('A')).toEqual(expect.arrayContaining(['A1', 'A8', 'A12', 'B4']));
    expect(r.flight('B')).toEqual(['B10', 'B11', 'B12', 'B5', 'B6', 'B7', 'B8', 'B9']);
    expect(r.flight('C')).toEqual(expect.arrayContaining(['C1', 'C12', 'D4']));
    expect(r.flight('D')).toHaveLength(8);
  });

  it.each(['balanced', 'classic'] as const)(
    '48 entries, %s pairing, byes in round 2: they go to the best of each group (A1–A8 and C1–C8), never to a D',
    (pairing) => {
      const ids = Array.from({ length: 48 }, (_, i) => `${'ABCD'[Math.floor(i / 12)]}${(i % 12) + 1}`);
      const plan = generateDraw({
        event: { ...event, config: { ...event.config, pairing, placementByes: 'round2' } },
        entryIds: ids,
        seeds: 48,
        rngSeed: 3,
        clubOf: () => undefined,
        levelOf,
      });
      const r = play(plan, ids);
      const played = (name: string) => new Set(r.games(name).flatMap((g) => g.split('-')));
      const skipped = (name: string, group: string[]) => group.filter((x) => !played(name).has(x)).sort();
      const sortIds = (xs: string[]) => [...xs].sort();
      expect(skipped('Round 2 upper', [...ids.slice(0, 24)])).toEqual(sortIds(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8']));
      expect(skipped('Round 2 lower', [...ids.slice(24)])).toEqual(sortIds(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']));
    },
  );

  it('flights name their rounds Round 1, Round 2 … Semi-final, Final', () => {
    const ids = Array.from({ length: 48 }, (_, i) => `${'ABCD'[Math.floor(i / 12)]}${(i % 12) + 1}`);
    const plan = make(ids);
    const a = plan.stages.find((s) => s.flight === 'A')!;
    expect([1, 2, 3, 4].map((r) => roundName(a, r))).toEqual(['Round 1', 'Round 2', 'Semi-final', 'Final']);
    // small flight: 6 players → Round 1 (2 byes), Semi-final, Final; 3 players → Round 1, Final
    expect([1, 2, 3].map((r) => roundName({ ...a, rounds: 3 }, r))).toEqual(['Round 1', 'Semi-final', 'Final']);
    expect([1, 2].map((r) => roundName({ ...a, rounds: 2 }, r))).toEqual(['Round 1', 'Final']);
  });

  it.each(([48, 47, 46, 45, 33, 12, 9] as const).flatMap((n) => (['round1', 'round2', 'flights'] as Byes[]).map((b) => [n, b] as const)))(
    '%i entries, byes %s: at most one bye each, and nobody is knocked out before their third game (a bye counts as one)',
    (n, placementByes) => {
      const ids = Array.from({ length: n }, (_, i) => `${'ABCD'[Math.floor((i * 4) / n)]}${i + 1}`);
      const plan = make(ids, undefined, n, { placementByes });
      // follow each player (better-ranked always wins): games played, byes, and the game they went out in
      const winnerOf = new Map<ID, ID | 'BYE'>();
      const loserOf = new Map<ID, ID | 'BYE'>();
      const who = (s: SlotSource): ID | 'BYE' | null =>
        s.kind === 'entry'
          ? s.entryId
          : s.kind === 'bye'
            ? 'BYE'
            : s.kind === 'winner'
              ? (winnerOf.get(s.matchId) ?? null)
              : s.kind === 'loser'
                ? (loserOf.get(s.matchId) ?? null)
                : null;
      const games = new Map<ID, number>();
      const byes = new Map<ID, number>();
      const outAt = new Map<ID, number>();
      const knockout = new Set(plan.stages.filter((st) => !st.placement).map((st) => st.id));
      // a flight slot fed straight from round 1 is a round-2 bye
      const r1 = new Set(inStage(plan, 'Round 1').map((m) => m.id));
      for (let progress = true; progress;) {
        progress = false;
        for (const m of plan.matches) {
          if (winnerOf.has(m.id)) continue;
          const a = who(m.srcA);
          const b = who(m.srcB);
          if (a === null || b === null) continue;
          progress = true;
          if (knockout.has(m.stageId) && m.round === 1)
            for (const [src, x] of [
              [m.srcA, a],
              [m.srcB, b],
            ] as const)
              if ((src.kind === 'winner' || src.kind === 'loser') && r1.has(src.matchId) && x !== 'BYE') {
                byes.set(x, (byes.get(x) ?? 0) + 1);
                games.set(x, (games.get(x) ?? 0) + 1);
              }
          if (a === 'BYE' || b === 'BYE') {
            const x = a === 'BYE' ? b : a;
            winnerOf.set(m.id, x);
            loserOf.set(m.id, 'BYE');
            if (x !== 'BYE') {
              byes.set(x, (byes.get(x) ?? 0) + 1);
              games.set(x, (games.get(x) ?? 0) + 1);
            }
            continue;
          }
          const [w, l] = ids.indexOf(a) < ids.indexOf(b) ? [a, b] : [b, a];
          winnerOf.set(m.id, w);
          loserOf.set(m.id, l);
          for (const x of [a, b]) games.set(x, (games.get(x) ?? 0) + 1);
          if (knockout.has(m.stageId)) outAt.set(l, games.get(l)!);
        }
      }
      expect(Math.max(...ids.map((id) => byes.get(id) ?? 0))).toBeLessThanOrEqual(1);
      expect(Math.min(...[...outAt.values()])).toBeGreaterThanOrEqual(3);
    },
  );

  it('marks where losers go', () => {
    const plan = make(FIELD);
    expect(inStage(plan, 'Round 1').every((m) => m.loserTo === 'Round 2 lower')).toBe(true);
    expect(inStage(plan, 'Round 2 upper').every((m) => m.loserTo === 'B flight')).toBe(true);
    expect(inStage(plan, 'Round 2 lower').every((m) => m.loserTo === 'D flight')).toBe(true);
  });

  it('needs at least 4 entries', () => {
    const plan = make(['A1', 'B1', 'C1']);
    expect(plan.warnings[0]).toMatch(/at least 4 entries/);
    expect(plan.stages.some((s) => s.placement)).toBe(false);
  });
});
