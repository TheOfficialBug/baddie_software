// Draw generation for the three competition modes:
//   Knockout (BWF GCR 11: seeding, byes, separation), ABCD Drop Flight, Round Robin (+ optional knockout).
// Every structure is expressed as matches whose two slots point at a source
// (an entry, a bye, the winner/loser of another match, or a group finishing position),
// so one resolver (progression.ts) drives all of them.
import { spreadClubs } from './clubSpread';
import { arrangeBalanced, rankByLevel, separateGroups } from './pairing';
import { mulberry32, shuffle } from './rng';
import type { DrawPlan, FlightLabel, Group, ID, Match, SlotSource, Stage, TEvent } from './types';

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
  /**
   * First-round lines fixed by the organizer (editing a published draw): used as they are, with no
   * placement, seeding or spreading. Only for knockout and drop flight.
   */
  lines?: (ID | 'BYE')[];
}

const clashesIn = (lines: (ID | 'BYE')[], clubOf: (id: ID) => string | undefined): [ID, ID][] => {
  const out: [ID, ID][] = [];
  for (let l = 0; l < lines.length; l += 2) {
    const [a, b] = [lines[l], lines[l + 1]];
    if (a !== 'BYE' && b !== 'BYE' && clubOf(a) && clubOf(a) === clubOf(b)) out.push([a, b]);
  }
  return out;
};

/**
 * Seeds + byes + first-round pairs: level-balanced when levels are known, otherwise BWF draw by lot.
 * Then clubmates are spread through the draw so they meet as late as possible (see clubSpread).
 */
function place(input: DrawInput, rand: () => number): Placement {
  if (input.lines) return { size: input.lines.length, lines: input.lines, clubClashes: clashesIn(input.lines, input.clubOf) };
  const pairing = input.event.config.pairing ?? 'balanced';
  const levelOf = input.levelOf;
  const balanced = pairing !== 'random' && !!levelOf;
  const p: Placement = balanced
    ? arrangeBalanced({ entryIds: input.entryIds, seeds: input.seeds, levelOf, clubOf: input.clubOf, pairing, rand })
    : placeKnockout(input.entryIds.slice(0, input.seeds), input.entryIds.slice(input.seeds), rand, input.clubOf);
  const lines = spreadClubs({
    lines: p.lines,
    seeded: new Set(input.entryIds.slice(0, input.seeds)),
    clubOf: input.clubOf,
    // level-balanced draws only trade players of the same level, so every match-up stays as drawn
    sameStrength: balanced ? (a, b) => levelOf(a) === levelOf(b) : undefined,
  });
  return { size: p.size, lines, clubClashes: clashesIn(lines, input.clubOf) };
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

function placementWarnings(p: Placement, nameOf?: (id: ID) => string, clubOf?: (id: ID) => string | undefined): string[] {
  return p.clubClashes.map(
    ([a, b]) =>
      `${nameOf?.(a) ?? a} and ${nameOf?.(b) ?? b} are both from ${clubOf?.(a) ?? 'the same club'} and meet in round 1. The draw couldn't keep them apart; shuffle again or move one of them after publishing.`,
  );
}

function knockoutDraw(input: DrawInput): DrawPlan {
  const { event, rngSeed, nameOf } = input;
  const rand = mulberry32(rngSeed);
  const p = place(input, rand);
  const main = makeStage(event.id, 'main', 'Main draw', 0, p.size);
  const stages = [main];
  const matches = buildBracket(main, p.lines.map(lineSource));
  const warnings = placementWarnings(p, nameOf, input.clubOf);

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

/** A flight fed in place: line i is the loser of feeder match i (tournamentsoftware keeps draw positions). */
function positionalFeeder(eventId: ID, key: string, name: string, order: number, flight: Stage['flight'], feeders: Match[], label: string) {
  if (realMatches(feeders).length < 1) return null;
  const real = new Set(realMatches(feeders).map((m) => m.id));
  const size = Math.max(2, nextPow2(feeders.length));
  const lines: SlotSource[] = Array.from({ length: size }, (_, i) => {
    const m = feeders[i];
    if (!m || !real.has(m.id)) return { kind: 'bye' };
    m.loserTo = label;
    return { kind: 'loser', matchId: m.id };
  });
  const stage = makeStage(eventId, key, name, order, size, flight);
  return { stage, matches: buildBracket(stage, lines) };
}

/** tournamentsoftware "Triple Plate": Plate (B), Special Plate (C), Consolation Plate (D), all in draw position. */
function triplePlate(eventId: ID, aMatches: Match[]): { stages: Stage[]; matches: Match[]; warnings: string[] } {
  const byIndex = (ms: Match[]) => [...ms].sort((a, b) => a.index - b.index);
  const out = { stages: [] as Stage[], matches: [] as Match[], warnings: [] as string[] };
  const B = positionalFeeder(eventId, 'B', 'B flight', 1, 'B', byIndex(roundOf(aMatches, 1)), 'B flight');
  const C = positionalFeeder(eventId, 'C', 'C flight', 2, 'C', byIndex(roundOf(aMatches, 2)), 'C flight');
  const D = B ? positionalFeeder(eventId, 'D', 'D flight', 3, 'D', byIndex(roundOf(B.matches, 1)), 'D flight') : null;
  for (const [f, key] of [
    [B, 'B'],
    [C, 'C'],
    [D, 'D'],
  ] as const) {
    if (f) {
      out.stages.push(f.stage);
      out.matches.push(...f.matches);
    } else out.warnings.push(`Nobody can drop into the ${key} flight with this draw (too many byes).`);
  }
  return out;
}

/**
 * Drop flight. Everyone starts in A.
 *   ABCD (triple elimination): A round-1 losers → C · A round-2 losers → B · C round-1 losers → D.
 *   AB (double elimination): A round-1 losers → B.
 * Lower flights are built from real losers only, so a player who loses their first match is
 * guaranteed 3 matches (ABCD) or 2 (AB). A player with a bye in A has one fewer guaranteed match.
 */
function dropFlightDraw(input: DrawInput): DrawPlan {
  if (input.event.config.variant === 'PLACEMENT') return placementDraw(input);
  const { event, entryIds, rngSeed, nameOf } = input;
  const rand = mulberry32(rngSeed);
  const p = place(input, rand);
  const S = p.size;
  const warnings = placementWarnings(p, nameOf, input.clubOf);

  const A = makeStage(event.id, 'A', 'A flight', 0, S, 'A');
  const aMatches = buildBracket(A, p.lines.map(lineSource));
  const stages: Stage[] = [A];
  const matches = [...aMatches];
  const aR1 = roundOf(aMatches, 1);
  const realR1 = realMatches(aR1).length;

  if (event.config.variant === 'ABCD' && event.config.layout === 'tournamentsoftware') {
    const tp = triplePlate(event.id, aMatches);
    return { stages: [...stages, ...tp.stages], groups: [], matches: [...matches, ...tp.matches], warnings: [...warnings, ...tp.warnings] };
  }

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

/** Fewest entries for placement rounds; smaller events play one A/B drop flight. */
const MIN_PLACEMENT = 4;

/** Position of each seed (0 = seed 1) among n slots, standard bracket placement: seed 1 top, seed 2 bottom, 3–4 quarters… */
function seedPositions(n: number): number[] {
  const lines = seedLines(nextPow2(Math.max(1, n))).slice(0, n);
  const sorted = [...lines].sort((a, b) => a - b);
  return lines.map((l) => sorted.indexOf(l));
}

/**
 * Drop flight with placement rounds ("A/B/C/D by results"). Fixed when published: nothing is
 * re-paired later.
 *   Ranking: the organizer's seeding order exactly (by lot after the seeds with "Random draw").
 *   Round 1: top half of the ranking v bottom half: 1 v N/2+1, 2 v N/2+2 … ("Close levels"),
 *            or 1 v N, 2 v N−1 … ("Ranked order"). Never two from the same half.
 *   Round 2: winners play winners (upper) and losers play losers (lower), paired the same way.
 *   Byes (config.placementByes), always to the top-ranked:
 *     round1 (default): the top of the seeding order skips round 1, as many as make the flights clean
 *                       knockout sizes (48 → 16 byes → flights of 16, 16, 8, 8);
 *     round2:           the best of each round-2 group skip round 2 (24 → 8 byes → flights of 16 and 8);
 *     flights:          no placement byes; each flight's Round 1 takes them (48 → flights of 12, 4 byes each).
 *   Flights: upper winners (and bye holders) → A, upper losers → B; lower → C and D. Each flight is
 *            a seeded knockout with rounds named Round 1, Round 2 … Semi-final, Final.
 * Odd field: the top seed gets a round-1 bye (a win). Nobody gets more than one bye.
 * Round 1 and round 2 matches sit in standard seed positions (seed 1 top, seed 2 bottom).
 */
function placementDraw(input: DrawInput): DrawPlan {
  const { event, entryIds, seeds, clubOf } = input;
  if (entryIds.length < MIN_PLACEMENT) {
    const plan = dropFlightDraw({ ...input, event: { ...event, config: { ...event.config, variant: 'AB' } } });
    return {
      ...plan,
      warnings: [`Placement rounds need at least ${MIN_PLACEMENT} entries, so this draw is one A/B drop flight.`, ...plan.warnings],
    };
  }
  const rand = mulberry32(input.rngSeed);
  const ranked = event.config.pairing === 'classic';
  const byeMode = event.config.placementByes ?? 'round1';
  /** Byes a knockout of n players needs (0 for 2, 4, 8, 16 …). */
  const flightByes = (n: number) => (n < 2 ? 0 : nextPow2(n) - n);
  const sameClub = (x: ID | 'BYE', y: ID | 'BYE') => x !== 'BYE' && y !== 'BYE' && !!clubOf(x) && clubOf(x) === clubOf(y);

  // Round 1 in rank order: from the draw editor (its lines are in seed positions), or from the ranking
  let rankPairs: [ID | 'BYE', ID | 'BYE'][];
  if (input.lines) {
    const shown: [ID | 'BYE', ID | 'BYE'][] = [];
    for (let l = 0; l < input.lines.length; l += 2) shown.push([input.lines[l], input.lines[l + 1]]);
    const at = seedPositions(shown.length);
    rankPairs = at.map((p) => shown[p]);
  } else {
    const ranking = event.config.pairing === 'random' ? [...entryIds.slice(0, seeds), ...shuffle(entryIds.slice(seeds), rand)] : entryIds;
    // round-1 byes for the top of the list: one for an odd field, or (round1) as many as make clean flights
    let r1Byes = ranking.length % 2;
    if (byeMode === 'round1') {
      let best = Infinity;
      for (let b = ranking.length % 2; b <= ranking.length / 2; b += 2) {
        const played = (ranking.length - b) / 2; // round-1 matches = losers in the lower group
        if (played < 4 && ranking.length >= 8) continue; // keep at least 4 players in the lower group
        const upper = b + played;
        const cost = [Math.ceil(upper / 2), Math.floor(upper / 2), Math.ceil(played / 2), Math.floor(played / 2)].reduce(
          (s, n) => s + flightByes(n),
          0,
        );
        if (cost < best) [best, r1Byes] = [cost, b];
      }
    }
    const byes = ranking.slice(0, r1Byes);
    const rest = ranking.slice(r1Byes);
    const top = rest.slice(0, rest.length / 2);
    const bottom = rest.slice(rest.length / 2);
    if (ranked) bottom.reverse();
    // clubmates apart: swap within the bottom half, nearest first (pairs stay top v bottom)
    for (let i = 0; i < top.length; i++) {
      if (!sameClub(top[i], bottom[i])) continue;
      const order = bottom
        .map((_, j) => j)
        .filter((j) => j !== i)
        .sort((x, y) => Math.abs(x - i) - Math.abs(y - i));
      const j = order.find((k) => !sameClub(top[i], bottom[k]) && !sameClub(top[k], bottom[i]));
      if (j !== undefined) [bottom[i], bottom[j]] = [bottom[j], bottom[i]];
    }
    rankPairs = [...byes.map((b) => [b, 'BYE'] as [ID, 'BYE']), ...top.map((t, i) => [t, bottom[i]] as [ID, ID])];
  }

  const stages: Stage[] = [];
  const matches: Match[] = [];
  const warnings: string[] = [];
  const placementStage = (key: string, name: string, order: number) => {
    const st: Stage = { ...makeStage(event.id, key, name, order, 2), rounds: 1, placement: true };
    stages.push(st);
    return st;
  };
  const won = (m: Match): SlotSource => ({ kind: 'winner', matchId: m.id });
  const lost = (m: Match): SlotSource => ({ kind: 'loser', matchId: m.id });
  const real = (m: Match) => !isByeSrc(m.srcA) && !isByeSrc(m.srcB);
  /** An entry's place in the seeding order (lower = better). */
  const seedOrder = new Map(entryIds.map((id, i) => [id, i]));
  const seedRank = (s: SlotSource) => (s.kind === 'entry' ? (seedOrder.get(s.entryId) ?? entryIds.length) : entryIds.length);
  /** A player's place in a group, best first; `rested` = already had a bye. */
  type Seat = { src: SlotSource; rested: boolean };

  // Round 1
  const s1 = placementStage('R1', 'Round 1', 0);
  const at1 = seedPositions(rankPairs.length);
  const r1 = rankPairs.map(([a, b], k) => {
    const m = blankMatch(event.id, s1.id, 1, at1[k], lineSource(a), lineSource(b));
    if (real(m)) m.loserTo = 'Round 2 lower';
    return m;
  });
  s1.size = r1.length * 2;
  matches.push(...r1);

  /**
   * Round 2 over one group (best first). Byes go to the best-ranked who haven't had one, as many as
   * make both resulting flights clean knockout sizes (fewest flight byes; then the fewest round-2 byes).
   */
  const round2 = (key: string, name: string, order: number, seats: Seat[], loserTo: string) => {
    const st = placementStage(key, name, order);
    const G = seats.length;
    // round2 byes: at most half the group gets one, and the losers' flight needs at least 2 players.
    // Otherwise everyone plays (an odd group's best player not yet rested gets the one bye).
    let games = Math.floor(G / 2);
    let best = Infinity;
    for (let m = Math.floor(G / 2); byeMode === 'round2' && m >= 1; m--) {
      if (G - 2 * m > G / 2 || (m < 2 && G >= 4)) continue;
      const cost = flightByes(G - m) + flightByes(m);
      if (cost < best) [best, games] = [cost, m];
    }
    const byeCount = G - 2 * games;
    const fresh = seats.filter((x) => !x.rested);
    const byes = [...fresh, ...seats.filter((x) => x.rested)].slice(0, byeCount);
    const playing = seats.filter((x) => !byes.includes(x));
    const top = playing.slice(0, games);
    const bottom = playing.slice(games);
    if (ranked) bottom.reverse();
    const at = seedPositions(games);
    const ms = top.map((t, k) => {
      const m = blankMatch(event.id, st.id, 1, at[k], t.src, bottom[k].src);
      m.loserTo = loserTo;
      return m;
    });
    st.size = ms.length * 2;
    matches.push(...ms);
    // winners: bye holders first (best-ranked), then the round-2 winners in rank order
    // a match with someone who already had a bye: whoever comes out of it may be that player
    const hadBye = (k: number) => top[k].rested || bottom[k].rested;
    const winners: Seat[] = [...byes.map((x) => ({ src: x.src, rested: true })), ...ms.map((m, k) => ({ src: won(m), rested: hadBye(k) }))];
    const losers: Seat[] = ms.map((m, k) => ({ src: lost(m), rested: hadBye(k) }));
    return { winners, losers };
  };
  const upper = round2(
    'R2U',
    'Round 2 upper',
    1,
    r1.map((m) => ({ src: won(m), rested: !real(m) })),
    'B flight',
  );
  const lower = round2(
    'R2L',
    'Round 2 lower',
    2,
    // best first by the expected loser's own place in the seeding order (not the match's), so round-2
    // byes go to the best C players, never to a D player who lost to an A (Ranked order: A1 v D12 …)
    r1
      .filter(real)
      .map((m) => ({ m, rank: Math.max(seedRank(m.srcA), seedRank(m.srcB)) }))
      .sort((x, y) => x.rank - y.rank)
      .map(({ m }) => ({ src: lost(m), rested: false })),
    'D flight',
  );

  /** A flight: seeded knockout over the players placed into it, best-placed on the top seed lines. */
  const flight = (label: FlightLabel, order: number, seats: Seat[]) => {
    if (seats.length < 2) {
      if (seats.length === 1) warnings.push(`Flight ${label} has only one player, so it has no matches.`);
      return;
    }
    const size = nextPow2(seats.length);
    const lineOf = seedLines(size);
    // any flight byes (only when the numbers can't be made clean) skip players who already had one
    const extra = size - seats.length;
    const first = seats.filter((x) => !x.rested).slice(0, extra);
    const srcs = [...first, ...seats.filter((x) => !first.includes(x))].map((x) => x.src);
    const fl: SlotSource[] = Array.from({ length: size }, () => ({ kind: 'bye' }));
    srcs.forEach((x, k) => (fl[lineOf[k]] = x));
    // rounds are named Round 1, Round 2 … Semi-final, Final
    const st: Stage = { ...makeStage(event.id, label, `${label} flight`, order, size, label), numberedRounds: true };
    stages.push(st);
    matches.push(...buildBracket(st, fl));
  };
  flight('A', 3, upper.winners);
  flight('B', 4, upper.losers);
  flight('C', 5, lower.winners);
  flight('D', 6, lower.losers);
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
  if (stage.placement) return short ? (stage.order === 0 ? 'R1' : 'R2') : stage.name;
  const left = stage.rounds - round;
  if (left === 0) return short ? 'F' : 'Final';
  if (stage.numberedRounds && (round === 1 || left > 1)) return short ? `R${round}` : `Round ${round}`;
  if (left === 1) return short ? 'SF' : 'Semi-final';
  if (left === 2) return short ? 'QF' : 'Quarter-final';
  return short ? `R${2 ** (left + 1)}` : `Round of ${2 ** (left + 1)}`;
}

/** Matches guaranteed to every entry that didn't get a bye. */
export function guaranteedMatches(mode: TEvent['mode'], variant: TEvent['config']['variant'], plate: boolean): number | 'all' {
  if (mode === 'round_robin') return 'all';
  if (mode === 'drop_flight') return variant === 'ABCD' || variant === 'PLACEMENT' ? 3 : 2;
  return plate ? 2 : 1;
}
