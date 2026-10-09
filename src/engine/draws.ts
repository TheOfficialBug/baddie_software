// Draw generation for the three competition modes:
//   Knockout (BWF GCR 11: seeding, byes, separation), ABCD Drop Flight, Round Robin (+ optional knockout).
// Every structure is expressed as matches whose two slots point at a source
// (an entry, a bye, the winner/loser of another match, or a group finishing position),
// so one resolver (progression.ts) drives all of them.
import { arrangeBalanced, rankByLevel, separateGroups } from './pairing';
import { mulberry32, shuffle } from './rng';
import type { DrawPlan, Group, ID, Match, SlotSource, Stage, TEvent } from './types';

export const nextPow2 = (n: number) => {
  let s = 2;
  while (s < n) s *= 2;
  return s;
};

/** GCR 11.7.1: 16 seeds for 64+, 8 for 32–63, 4 for 16–31, otherwise 2. */
export function bwfSeedCount(entries: number): number {
  if (entries >= 64) return 16;
  if (entries >= 32) return 8;
  if (entries >= 16) return 4;
  return Math.min(2, entries);
}

/**
 * Line (0-based) for each virtual seed in a draw of size S.
 * Seed 1 top, seed 2 bottom; seeds in the top half sit at the top of their section
 * and seeds in the bottom half at the bottom (GCR 11.8.3).
 */
export function seedLines(S: number): number[] {
  let order = [1, 2];
  while (order.length < S) {
    const n = order.length * 2;
    order = order.flatMap((x) => [x, n + 1 - x]);
  }
  const half = S / 2;
  const mirrored = [...order.slice(0, half), ...order.slice(half).reverse()];
  const lineOf: number[] = new Array(S);
  mirrored.forEach((seed, line) => (lineOf[seed - 1] = line));
  return lineOf;
}

/** Lot groups: [1], [2], [3,4], [5..8], [9..16] (GCR 11.10). */
function lotGroups(k: number): number[][] {
  const groups: number[][] = [];
  if (k >= 1) groups.push([1]);
  if (k >= 2) groups.push([2]);
  for (let lo = 3; lo <= k; lo = lo * 2 - 1) {
    const hi = Math.min(k, lo * 2 - 2);
    groups.push(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
  }
  return groups;
}

export interface Placement {
  size: number;
  lines: (ID | 'BYE')[];
  /** pairs that share a club in round 1 and could not be separated */
  clubClashes: [ID, ID][];
}

/** Place seeds, byes and unseeded entries into a knockout draw (GCR 11.4–11.11). */
export function placeKnockout(seeded: ID[], unseeded: ID[], rand: () => number, clubOf: (id: ID) => string | undefined): Placement {
  const N = seeded.length + unseeded.length;
  const S = nextPow2(N);
  const lineOf = seedLines(S);
  const lines: (ID | 'BYE' | null)[] = new Array(S).fill(null);
  const k = seeded.length;

  // Seeds: within each lot group the seeds are drawn by lot into that group's positions.
  const realSeedLine: number[] = [];
  for (const group of lotGroups(k)) {
    const positions = shuffle(
      group.map((g) => lineOf[g - 1]),
      rand,
    );
    group.forEach((seedNo, i) => {
      realSeedLine[seedNo - 1] = positions[i];
      lines[positions[i]] = seeded[seedNo - 1];
    });
  }

  // Byes: to the seeds in order, then to the next virtual seed positions (spreads byes evenly).
  let byes = S - N;
  const opp = (line: number) => line ^ 1;
  for (let i = 0; i < k && byes > 0; i++, byes--) lines[opp(realSeedLine[i])] = 'BYE';
  for (let v = k; byes > 0 && v < S; v++) {
    const line = lineOf[v];
    if (lines[line] === null && lines[opp(line)] === null) {
      lines[opp(line)] = 'BYE';
      byes--;
    }
  }

  // Unseeded entries fill the rest at random.
  const free = lines.map((x, i) => (x === null ? i : -1)).filter((i) => i >= 0);
  shuffle(unseeded, rand).forEach((id, i) => (lines[free[i]] = id));

  // Separation (GCR 11.11.2): avoid same-club meetings in round 1 where possible.
  const isSeed = new Set(seeded);
  const clubAt = (line: number) => {
    const v = lines[line];
    return v && v !== 'BYE' ? clubOf(v) || undefined : undefined;
  };
  const clash = (line: number) => {
    const c = clubAt(line);
    return !!c && c === clubAt(opp(line));
  };
  for (let line = 0; line < S; line++) {
    if (!clash(line)) continue;
    // move whichever side of the pair is unseeded
    const mover = !isSeed.has(lines[line] as ID) ? line : !isSeed.has(lines[opp(line)] as ID) ? opp(line) : -1;
    if (mover < 0) continue;
    for (let t = 0; t < S; t++) {
      const v = lines[t];
      if (t === mover || t === opp(mover) || !v || v === 'BYE' || isSeed.has(v)) continue;
      [lines[mover], lines[t]] = [lines[t], lines[mover]];
      if (!clash(mover) && !clash(t)) break;
      [lines[mover], lines[t]] = [lines[t], lines[mover]];
    }
  }
  const clubClashes: [ID, ID][] = [];
  for (let line = 0; line < S; line += 2) if (clash(line)) clubClashes.push([lines[line] as ID, lines[line + 1] as ID]);

  return { size: S, lines: lines as (ID | 'BYE')[], clubClashes };
}

const lineSource = (v: ID | 'BYE'): SlotSource => (v === 'BYE' ? { kind: 'bye' } : { kind: 'entry', entryId: v });

function blankMatch(eventId: ID, stageId: ID, round: number, index: number, srcA: SlotSource, srcB: SlotSource, groupId?: ID): Match {
  return {
    id: `${stageId}-r${round}-m${index}`,
    eventId,
    stageId,
    groupId,
    number: 0,
    round,
    index,
    srcA,
    srcB,
    a: null,
    b: null,
    status: 'pending',
    games: [],
    live: null,
  };
}

/** Build a single-elimination bracket over the given line sources. */
export function buildBracket(stage: Stage, sources: SlotSource[]): Match[] {
  const out: Match[] = [];
  let prev: Match[] = [];
  for (let r = 1; r <= stage.rounds; r++) {
    const count = stage.size / 2 ** r;
    const cur: Match[] = [];
    for (let i = 0; i < count; i++) {
      const srcA: SlotSource = r === 1 ? sources[2 * i] : { kind: 'winner', matchId: prev[2 * i].id };
      const srcB: SlotSource = r === 1 ? sources[2 * i + 1] : { kind: 'winner', matchId: prev[2 * i + 1].id };
      cur.push(blankMatch(stage.eventId, stage.id, r, i, srcA, srcB));
    }
    out.push(...cur);
    prev = cur;
  }
  return out;
}

function makeStage(eventId: ID, key: string, name: string, order: number, size: number, flight?: Stage['flight']): Stage {
  return { id: `${eventId}-${key}`, eventId, kind: 'knockout', name, flight, order, size, rounds: Math.log2(size) };
}

const roundOf = (ms: Match[], r: number) => ms.filter((m) => m.round === r).sort((x, y) => x.index - y.index);

export interface DrawInput {
  event: TEvent;
  /** accepted entries in seed order (seeded first, then the rest) */
  entryIds: ID[];
  seeds: number;
  rngSeed: number;
  clubOf: (id: ID) => string | undefined;
  nameOf?: (id: ID) => string;
  /** skill level as a number (A=4 … D=1); enables level-balanced pairing */
  levelOf?: (id: ID) => number;
}

/** Seeds + byes + first-round pairs: level-balanced when levels are known, otherwise BWF draw by lot. */
function place(input: DrawInput, rand: () => number): Placement {
  const pairing = input.event.config.pairing ?? 'balanced';
  if (pairing !== 'random' && input.levelOf) {
    const a = arrangeBalanced({
      entryIds: input.entryIds,
      seeds: input.seeds,
      levelOf: input.levelOf,
      clubOf: input.clubOf,
      pairing,
      rand,
    });
    return { size: a.size, lines: a.lines, clubClashes: a.clubClashes };
  }
  return placeKnockout(input.entryIds.slice(0, input.seeds), input.entryIds.slice(input.seeds), rand, input.clubOf);
}

export function generateDraw(input: DrawInput): DrawPlan {
  switch (input.event.mode) {
    case 'knockout':
      return knockoutDraw(input);
    case 'drop_flight':
      return dropFlightDraw(input);
    case 'round_robin':
      return roundRobinDraw(input);
  }
}

function placementWarnings(p: Placement, nameOf?: (id: ID) => string): string[] {
  return p.clubClashes.map(
    ([a, b]) =>
      `${nameOf?.(a) ?? a} and ${nameOf?.(b) ?? b} are from the same club and meet in round 1. There was no way to separate them.`,
  );
}

function knockoutDraw(input: DrawInput): DrawPlan {
  const { event, rngSeed, nameOf } = input;
  const rand = mulberry32(rngSeed);
  const p = place(input, rand);
  const main = makeStage(event.id, 'main', 'Main draw', 0, p.size);
  const stages = [main];
  const matches = buildBracket(main, p.lines.map(lineSource));
  const warnings = placementWarnings(p, nameOf);

  if (event.config.plate) {
    const plate = feederBracket(event.id, 'plate', 'Plate', 1, undefined, roundOf(matches, 1), 'Plate');
    if (plate) {
      stages.push(plate.stage);
      matches.push(...plate.matches);
    } else warnings.push('Too many byes for a plate: fewer than 2 players can lose in round 1.');
  }
  if (event.config.thirdPlace && main.rounds >= 2) {
    const semis = roundOf(
      matches.filter((m) => m.stageId === main.id),
      main.rounds - 1,
    );
    if (realMatches(semis).length === 2) {
      const third: Stage = { ...makeStage(event.id, 'third', '3rd place', 2, 2), rounds: 1 };
      stages.push(third);
      matches.push(blankMatch(event.id, third.id, 1, 0, { kind: 'loser', matchId: semis[0].id }, { kind: 'loser', matchId: semis[1].id }));
    } else warnings.push('No 3rd-place match: one semi-final is a bye.');
  }
  return { stages, groups: [], matches, warnings };
}

const isByeSrc = (s: SlotSource) => s.kind === 'bye';
const realMatches = (ms: Match[]) => ms.filter((m) => !isByeSrc(m.srcA) && !isByeSrc(m.srcB));

/**
 * A lower flight (or plate) fed only by the losers of real matches in `feeders`.
 * Byes in the upper draw therefore never leave empty slots below. Losers take the
 * virtual-seed lines in feeder order, which spreads neighbours apart and puts any
 * byes at the standard positions. Returns null when fewer than 2 players can drop.
 */
function feederBracket(eventId: ID, key: string, name: string, order: number, flight: Stage['flight'], feeders: Match[], label: string) {
  const real = realMatches(feeders);
  if (real.length < 2) return null;
  const size = nextPow2(real.length);
  const lineOf = seedLines(size);
  const lines: SlotSource[] = Array.from({ length: size }, () => ({ kind: 'bye' }));
  real.forEach((m, i) => {
    lines[lineOf[i]] = { kind: 'loser', matchId: m.id };
    m.loserTo = label;
  });
  const stage = makeStage(eventId, key, name, order, size, flight);
  return { stage, matches: buildBracket(stage, lines) };
}

/**
 * Drop flight. Everyone starts in A.
 *   ABCD (triple elimination): A round-1 losers → C · A round-2 losers → B · C round-1 losers → D.
 *   AB (double elimination): A round-1 losers → B.
 * Lower flights are built from real losers only, so a player who loses their first match is
 * guaranteed 3 matches (ABCD) or 2 (AB). A player with a bye in A has one fewer guaranteed match.
 */
function dropFlightDraw(input: DrawInput): DrawPlan {
  const { event, entryIds, rngSeed, nameOf } = input;
  const rand = mulberry32(rngSeed);
  const p = place(input, rand);
  const S = p.size;
  const warnings = placementWarnings(p, nameOf);

  const A = makeStage(event.id, 'A', 'A flight', 0, S, 'A');
  const aMatches = buildBracket(A, p.lines.map(lineSource));
  const stages: Stage[] = [A];
  const matches = [...aMatches];
  const aR1 = roundOf(aMatches, 1);
  const realR1 = realMatches(aR1).length;

  let variant = event.config.variant;
  if (variant === 'ABCD' && (realR1 < 4 || S < 8)) {
    variant = 'AB';
    warnings.push(
      `With ${entryIds.length} entries only ${realR1} first-round match${realR1 === 1 ? ' is' : 'es are'} played (the rest are byes), which is too few for C and D flights. ABCD needs at least 4, so this draw uses A/B instead.`,
    );
  }

  if (variant === 'AB') {
    const B = feederBracket(event.id, 'B', 'B flight', 1, 'B', aR1, 'B flight');
    if (B) {
      stages.push(B.stage);
      matches.push(...B.matches);
    } else warnings.push('Too many byes for a B flight: fewer than 2 players can lose in round 1.');
  } else {
    const B = feederBracket(event.id, 'B', 'B flight', 1, 'B', roundOf(aMatches, 2), 'B flight')!;
    const C = feederBracket(event.id, 'C', 'C flight', 2, 'C', aR1, 'C flight')!;
    const D = feederBracket(event.id, 'D', 'D flight', 3, 'D', roundOf(C.matches, 1), 'D flight');
    stages.push(B.stage, C.stage);
    matches.push(...B.matches, ...C.matches);
    if (D) {
      stages.push(D.stage);
      matches.push(...D.matches);
    } else warnings.push('Too many byes for a D flight: fewer than 2 players can lose in C round 1.');
  }
  return { stages, groups: [], matches, warnings };
}

/** Group count that keeps groups at the requested size without leaving a group of 1–2. */
export function groupCount(n: number, size: number): number {
  let g = Math.max(1, Math.ceil(n / size));
  while (g > 1 && Math.floor(n / g) < 3) g--;
  return g;
}

/** Circle-method pairings; for a group of 4 this is the BWF-recommended order. */
export function roundRobinPairs(n: number): [number, number][][] {
  const ids: (number | null)[] = Array.from({ length: n }, (_, i) => i);
  if (ids.length % 2) ids.push(null);
  const m = ids.length;
  const rounds: [number, number][][] = [];
  let ring = ids.slice();
  for (let r = 0; r < m - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < m / 2; i++) {
      const x = ring[i];
      const y = ring[m - 1 - i];
      if (x !== null && y !== null) pairs.push([Math.min(x, y), Math.max(x, y)]);
    }
    rounds.push(pairs);
    ring = [ring[0], ring[m - 1], ...ring.slice(1, m - 1)];
  }
  return rounds;
}

function roundRobinDraw({ event, entryIds, seeds, rngSeed, clubOf, levelOf }: DrawInput): DrawPlan {
  const rand = mulberry32(rngSeed);
  // Seeds first, then by skill level (ties by lot), so the snake spreads levels evenly over groups.
  const ordered =
    levelOf && (event.config.pairing ?? 'balanced') !== 'random'
      ? rankByLevel(entryIds, seeds, levelOf, rand)
      : [...entryIds.slice(0, seeds), ...shuffle(entryIds.slice(seeds), rand)];
  const G = groupCount(ordered.length, event.config.groupSize);
  const stage: Stage = {
    id: `${event.id}-groups`,
    eventId: event.id,
    kind: 'group',
    name: G > 1 ? 'Groups' : 'Round robin',
    order: 0,
    size: 0,
    rounds: 0,
  };
  const groups: Group[] = Array.from({ length: G }, (_, g) => ({
    id: `${stage.id}-${String.fromCharCode(65 + g)}`,
    stageId: stage.id,
    eventId: event.id,
    name: G > 1 ? `Group ${String.fromCharCode(65 + g)}` : 'Group',
    entryIds: [],
  }));
  // Snake seeding keeps group strength even: 1→A, 2→B, 3→B, 4→A, …
  ordered.forEach((id, i) => {
    const row = Math.floor(i / G);
    const col = row % 2 === 0 ? i % G : G - 1 - (i % G);
    groups[col].entryIds.push(id);
  });
  // Keep players from the same club in different groups where a same-strength swap allows it.
  separateGroups(
    groups.map((g) => g.entryIds),
    clubOf,
  ).forEach((ids, i) => (groups[i].entryIds = ids));

  const matches: Match[] = [];
  let maxRounds = 0;
  for (const g of groups) {
    const rounds = roundRobinPairs(g.entryIds.length);
    maxRounds = Math.max(maxRounds, rounds.length);
    let idx = 0;
    const gm: Match[] = [];
    rounds.forEach((pairs, r) =>
      pairs.forEach(([x, y]) => {
        const m = blankMatch(
          event.id,
          stage.id,
          r + 1,
          idx++,
          { kind: 'entry', entryId: g.entryIds[x] },
          { kind: 'entry', entryId: g.entryIds[y] },
          g.id,
        );
        m.id = `${g.id}-m${m.index}`;
        gm.push(m);
      }),
    );
    // GCR 16.5: players from the same club play each other first.
    const sameClub = (m: Match) => {
      const ca = m.srcA.kind === 'entry' ? clubOf(m.srcA.entryId) : undefined;
      const cb = m.srcB.kind === 'entry' ? clubOf(m.srcB.entryId) : undefined;
      return !!ca && ca === cb;
    };
    const firsts = gm.filter(sameClub);
    if (firsts.length) {
      const rest = gm.filter((m) => !sameClub(m));
      [...firsts, ...rest].forEach((m, i) => (m.index = i));
    }
    matches.push(...gm);
  }
  stage.rounds = maxRounds;

  const stages: Stage[] = [stage];
  const adv = event.config.advance;
  if (adv > 0 && G * adv >= 2) {
    const S = nextPow2(G * adv);
    const lineOf = seedLines(S);
    const lines: (SlotSource | null)[] = new Array(S).fill(null);
    groups.forEach((g, i) => (lines[lineOf[i]] = { kind: 'group', groupId: g.id, rank: 1 }));
    let byes = S - G * adv;
    for (let i = 0; byes > 0 && i < S; i++) {
      const o = lineOf[i] ^ 1;
      if (!lines[o]) {
        lines[o] = { kind: 'bye' };
        byes--;
      }
    }
    if (adv === 2) {
      // Runners-up go to the opposite half from their own group winner, as far away as possible.
      for (let i = G - 1; i >= 0; i--) {
        const wl = lineOf[i];
        const mirror = S - 1 - wl;
        const free = lines
          .map((x, l) => (x === null ? l : -1))
          .filter((l) => l >= 0 && (wl < S / 2 ? l >= S / 2 : l < S / 2))
          .sort((p, q) => Math.abs(p - mirror) - Math.abs(q - mirror));
        const pick = free[0] ?? lines.findIndex((x) => x === null);
        lines[pick] = { kind: 'group', groupId: groups[i].id, rank: 2 };
      }
    }
    const ko = makeStage(event.id, 'ko', 'Knockout', 1, S);
    stages.push(ko);
    matches.push(
      ...buildBracket(
        ko,
        lines.map((x) => x ?? { kind: 'bye' }),
      ),
    );
  }

  return { stages, groups, matches, warnings: [] };
}

/** Round label: "Final", "Semi-final", "Quarter-final", "Round of 16"… or "Round 2" in groups. */
export function roundName(stage: Stage, round: number, short = false): string {
  if (stage.kind === 'group') return short ? `R${round}` : `Round ${round}`;
  if (stage.name === '3rd place') return short ? '3/4' : '3rd place';
  const left = stage.rounds - round;
  if (left === 0) return short ? 'F' : 'Final';
  if (left === 1) return short ? 'SF' : 'Semi-final';
  if (left === 2) return short ? 'QF' : 'Quarter-final';
  return short ? `R${2 ** (left + 1)}` : `Round of ${2 ** (left + 1)}`;
}

/** Matches guaranteed to every entry that didn't get a bye. */
export function guaranteedMatches(mode: TEvent['mode'], variant: TEvent['config']['variant'], plate: boolean): number | 'all' {
  if (mode === 'round_robin') return 'all';
  if (mode === 'drop_flight') return variant === 'ABCD' ? 3 : 2;
  return plate ? 2 : 1;
}
