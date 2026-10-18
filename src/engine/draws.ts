// Draw generation for the three competition modes:
//   Knockout (BWF GCR 11: seeding, byes, separation), ABCD Drop Flight, Round Robin (+ optional knockout).
// Every structure is expressed as matches whose two slots point at a source
// (an entry, a bye, the winner/loser of another match, or a group finishing position),
// so one resolver (progression.ts) drives all of them.
import { spreadClubs } from './clubSpread';
import { arrangeBalanced, arrangeDropFlight, isLowerLevel, rankByLevel, separateGroups } from './pairing';
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
  /**
   * Drop flight by results only: first-round lines added in the draw editor (pairs, e.g. a player and a bye),
   * ranked after the published `lines`. Lines with nobody in them are dropped.
   */
  extraLines?: (ID | 'BYE')[];
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
function place(input: DrawInput, rand: () => number, arrange = arrangeBalanced): Placement {
  if (input.lines) return { size: input.lines.length, lines: input.lines, clubClashes: clashesIn(input.lines, input.clubOf) };
  const pairing = input.event.config.pairing ?? 'balanced';
  const levelOf = input.levelOf;
  const balanced = pairing !== 'random' && !!levelOf;
  const p: Placement = balanced
    ? arrange({ entryIds: input.entryIds, seeds: input.seeds, levelOf, clubOf: input.clubOf, pairing, rand })
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

/**
 * A tournamentsoftware plate: line i takes whoever started in `origins[i]` (a first-round match of another flight)
 * and loses their `nth` match there, so each player drops on the line of the match they came from. Lines whose
 * first-round match is empty stay byes.
 */
function dropFeeder(eventId: ID, key: string, name: string, order: number, flight: Stage['flight'], origins: Match[], nth: 1 | 2) {
  if (!origins.length) return null;
  const size = Math.max(2, nextPow2(origins.length));
  const lines: SlotSource[] = Array.from({ length: size }, (_, i) => {
    const o = origins[i];
    if (!o || (isByeSrc(o.srcA) && isByeSrc(o.srcB))) return { kind: 'bye' };
    if (nth === 1) o.loserTo ??= name;
    return { kind: 'drop', matchId: o.id, nth };
  });
  const stage = makeStage(eventId, key, name, order, size, flight);
  return { stage, matches: buildBracket(stage, lines) };
}

/**
 * tournamentsoftware's Special Plate: second-match losers of A. First-round match j of the plate pairs the loser of A
 * round-3 match k = (M − 2 − j) / 2 (first line, even j only) with the loser of A round-2 match j (second line) (M = round-2 matches), each only if
 * it was that player's second match: a player whose first match was in round 2 or 3 (after byes) meets someone from
 * the other side of the draw.
 */
function specialPlate(eventId: ID, a2: Match[], a3: Match[]) {
  const r2 = [...a2].sort((a, b) => a.index - b.index);
  const r3 = [...a3].sort((a, b) => a.index - b.index);
  const M = r2.length;
  if (M < 1) return null;
  const lines: SlotSource[] = [];
  for (let j = 0; j < M; j++) {
    const k = j % 2 === 0 ? (M - 2 - j) / 2 : -1;
    lines.push(k >= 0 && r3[k] ? { kind: 'loser', matchId: r3[k].id, nth: 2 } : { kind: 'bye' });
    lines.push({ kind: 'loser', matchId: r2[j].id, nth: 2 });
  }
  const size = Math.max(2, nextPow2(lines.length));
  while (lines.length < size) lines.push({ kind: 'bye' });
  const stage = makeStage(eventId, 'C', 'C flight', 2, size, 'C');
  return { stage, matches: buildBracket(stage, lines) };
}

/**
 * tournamentsoftware "Triple Plate", sized and fed like the site: Plate (B) = first-match losers of A (one line per A
 * first-round match), Special Plate (C) = second-match losers of A (see specialPlate), Consolation Plate (D) =
 * first-match losers of B (one line per B first-round match). A bye in round 1 doesn't count as a match, so a player who had one and
 * loses in round 2 drops to the Plate, on their own line.
 */
function triplePlate(eventId: ID, aMatches: Match[]): { stages: Stage[]; matches: Match[]; warnings: string[] } {
  const byIndex = (ms: Match[]) => [...ms].sort((a, b) => a.index - b.index);
  const out = { stages: [] as Stage[], matches: [] as Match[], warnings: [] as string[] };
  const a1 = byIndex(roundOf(aMatches, 1));
  const B = dropFeeder(eventId, 'B', 'B flight', 1, 'B', a1, 1);
  const C = specialPlate(eventId, roundOf(aMatches, 2), roundOf(aMatches, 3));
  const D = B ? dropFeeder(eventId, 'D', 'D flight', 3, 'D', byIndex(roundOf(B.matches, 1)), 1) : null;
  for (const f of [B, C, D])
    if (f) {
      out.stages.push(f.stage);
      out.matches.push(...f.matches);
    }
  return out;
}

/** A level band: A (and A/B pairs), B (and B/C), C, D (and C/D). */
type Band = 'A' | 'B' | 'C' | 'D';
const bandOf = (level: number): Band => (level >= 3.5 ? 'A' : level > 2 ? 'B' : level >= 2 ? 'C' : 'D');

/**
 * Replace "winner of a match with nobody in it" by a bye, round after round, so an empty corner of the
 * bracket stands for a bye in a later round. Returns whether anything was empty.
 */
function collapseEmpty(ms: Match[]): boolean {
  const empty = new Set<ID>();
  const rounds = Math.max(0, ...ms.map((m) => m.round));
  for (let r = 1; r <= rounds; r++)
    for (const m of ms.filter((x) => x.round === r)) {
      const fix = (src: SlotSource): SlotSource => (src.kind === 'winner' && empty.has(src.matchId) ? { kind: 'bye' } : src);
      [m.srcA, m.srcB] = [fix(m.srcA), fix(m.srcB)];
      if (isByeSrc(m.srcA) && isByeSrc(m.srcB)) empty.add(m.id);
    }
  return empty.size > 0;
}

type Line = ID | 'BYE';

/**
 * Expected run of a knockout on `lines`: the higher level wins (ties: the better-ranked). For every match
 * (by round and index) how many matches its expected loser had played before (−1: a bye), and each
 * player's results in order.
 */
function expectRun(lines: Line[], levelOf: (id: ID) => number, rankOf: (id: ID) => number) {
  const played = new Map<ID, number>();
  const results = new Map<ID, ('W' | 'L')[]>();
  const loserPlayed: number[][] = [];
  const loserOf: (ID | null)[][] = [];
  let cur = lines;
  while (cur.length > 1) {
    const next: Line[] = [];
    const lp: number[] = [];
    const lo: (ID | null)[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      const [a, b] = [cur[i], cur[i + 1]];
      if (a === 'BYE' || b === 'BYE') {
        next.push(a === 'BYE' ? b : a);
        lp.push(-1);
        lo.push(null);
        continue;
      }
      const aWins = levelOf(a) > levelOf(b) || (levelOf(a) === levelOf(b) && rankOf(a) < rankOf(b));
      const [w, l] = aWins ? [a, b] : [b, a];
      lp.push(played.get(l) ?? 0);
      lo.push(l);
      for (const [x, r] of [
        [w, 'W'],
        [l, 'L'],
      ] as const) {
        played.set(x, (played.get(x) ?? 0) + 1);
        results.set(x, [...(results.get(x) ?? []), r]);
      }
      next.push(w);
    }
    loserPlayed.push(lp);
    loserOf.push(lo);
    cur = next;
  }
  return { loserPlayed, loserOf, results };
}

/**
 * Improve a first round by swapping places (players or byes; a line pair never becomes two byes, so byes stay
 * in round 1) while the number of players missing their flight goes down (then: seeds without a bye). `ok(band, first, second)` says
 * whether a player's first two expected results (1 win, 2 loss, 0 none) fit their band. The bracket is
 * replayed on number arrays, so thousands of tries stay fast. Deterministic for a given `rand`.
 */
function improveLines(
  lines: Line[],
  levelOf: (id: ID) => number,
  rankOf: (id: ID) => number,
  ok: (band: Band, first: number, second: number) => boolean,
  rand: () => number,
  /** Seeds (the best-ranked this many) get round-1 byes where that costs nobody their flight, best seeds first. */
  seeds = 0,
): Line[] {
  const ids = [...new Set(lines.filter((x): x is ID => x !== 'BYE'))];
  const at = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const lv = Float64Array.from(ids, levelOf);
  const rk = Float64Array.from(ids, rankOf);
  const bands = ids.map((id) => bandOf(levelOf(id)));
  const r0 = new Uint8Array(n);
  const r1 = new Uint8Array(n);
  const pl = new Uint8Array(n);
  const S = lines.length;
  const work = new Int32Array(S);
  const miss = (l: Int32Array) => {
    r0.fill(0);
    r1.fill(0);
    pl.fill(0);
    work.set(l);
    const note = (x: number, res: number) => {
      if (pl[x] === 0) r0[x] = res;
      else if (pl[x] === 1) r1[x] = res;
      pl[x]++;
    };
    for (let len = S; len > 1; len >>= 1)
      for (let i = 0; i < len / 2; i++) {
        const a = work[2 * i];
        const b = work[2 * i + 1];
        if (a < 0 || b < 0) {
          work[i] = a < 0 ? b : a;
          continue;
        }
        const aWins = lv[a] > lv[b] || (lv[a] === lv[b] && rk[a] < rk[b]);
        note(aWins ? a : b, 1);
        note(aWins ? b : a, 2);
        work[i] = aWins ? a : b;
      }
    let k = 0;
    for (let x = 0; x < n; x++) if (!ok(bands[x], r0[x], r1[x])) k++;
    // a player outside their flight always counts for more than any seed without a bye
    let seedsPlaying = 0;
    for (let i = 0; i < S && seeds; i++) if (l[i] >= 0 && rk[l[i]] < seeds && l[i ^ 1] >= 0) seedsPlaying += seeds - rk[l[i]];
    return k * 1000 + seedsPlaying;
  };
  const valid = (l: Int32Array, p: number, q: number) => !((l[p] < 0 && l[p ^ 1] < 0) || (l[q] < 0 && l[q ^ 1] < 0));
  let best = Int32Array.from(lines, (x) => (x === 'BYE' ? -1 : at.get(x)!));
  let bestCost = miss(best);
  // several runs: each starts from the best so far, shaken up by a few random swaps, and stops when a long
  // stretch of tries finds nothing better
  for (let run = 0; run < 12 && bestCost > 0; run++) {
    const cur = best.slice();
    for (let k = 0; run > 0 && k < 6; k++) {
      const p = Math.floor(rand() * S);
      const q = Math.floor(rand() * S);
      [cur[p], cur[q]] = [cur[q], cur[p]];
      if (!valid(cur, p, q)) [cur[p], cur[q]] = [cur[q], cur[p]];
    }
    let curCost = miss(cur);
    for (let it = 0, since = 0; it < 20000 && since < 2500 && bestCost > 0; it++, since++) {
      const p = Math.floor(rand() * S);
      const q = Math.floor(rand() * S);
      if (p === q || cur[p] === cur[q]) continue;
      [cur[p], cur[q]] = [cur[q], cur[p]];
      if (!valid(cur, p, q)) {
        [cur[p], cur[q]] = [cur[q], cur[p]];
        continue;
      }
      const c = miss(cur);
      // keep improvements; sometimes walk along a plateau to get out of it
      if (c < curCost || (c === curCost && rand() < 0.3)) {
        curCost = c;
        if (c < bestCost) {
          bestCost = c;
          best = cur.slice();
          since = 0;
        }
      } else [cur[p], cur[q]] = [cur[q], cur[p]];
    }
  }
  return Array.from(best, (x): Line => (x < 0 ? 'BYE' : ids[x]));
}

/** Turn each match so the side with the better-ranked player is on top (outcomes don't change; seed 1 ends up on line 1). */
function canonical(lines: Line[], rankOf: (id: ID) => number): Line[] {
  const bestOf = (xs: Line[]) => Math.min(...xs.map((x) => (x === 'BYE' ? Infinity : rankOf(x))));
  const go = (xs: Line[]): Line[] => {
    if (xs.length === 1) return xs;
    const h = xs.length / 2;
    const [a, b] = [go(xs.slice(0, h)), go(xs.slice(h))];
    return bestOf(a) <= bestOf(b) ? [...a, ...b] : [...b, ...a];
  };
  return go(lines);
}

/** First round in seed order: matches and bye holders, best-ranked first, on standard seed positions. */
function seedOrder(slots: Line[][], rankOf: (id: ID) => number): Line[] {
  const best = (s: Line[]) => Math.min(...s.map((x) => (x === 'BYE' ? Infinity : rankOf(x))));
  const sorted = [...slots].sort((x, y) => best(x) - best(y));
  const lineOf = seedLines(Math.max(2, sorted.length));
  const lines: Line[] = new Array(Math.max(2, sorted.length) * 2).fill('BYE');
  sorted.forEach((s, k) => {
    lines[2 * lineOf[k]] = s[0];
    lines[2 * lineOf[k] + 1] = s[1];
  });
  return lines;
}

/**
 * A first round for `ids` in a draw of the next power of two, byes only in round 1: pairs from `pair` (strong
 * against weak), the rest bye holders.
 */
function startLines(strong: ID[], weak: ID[], N: number, rankOf: (id: ID) => number): Line[] {
  const S = nextPow2(Math.max(2, N));
  const matches = N - S / 2;
  const pool = [...strong, ...weak];
  const slots: Line[][] = [];
  const k = Math.min(matches, strong.length, weak.length);
  for (let i = 0; i < k; i++) slots.push([strong[strong.length - k + i], weak[i]]);
  const used = new Set(slots.flat());
  const rest = pool.filter((x) => !used.has(x));
  // more matches needed: from the rest, best against worst
  for (let i = 0; slots.length < matches; i++) slots.push([rest.shift()!, rest.pop()!]);
  for (const x of rest) slots.push([x, 'BYE']);
  return seedOrder(slots, rankOf);
}

/**
 * A/B/C/D with levels. A player's flight is set by their first two matches: A win, win · B win, lose ·
 * C lose, win · D lose, lose. Byes only in round 1 (an empty place later would be a mid-bracket bye); the
 * first round is arranged so the expected results (higher level wins) give everyone the flight of their level:
 *   - in flight A, a player's first loss sends them to C if it was their first match, to B if it was their
 *     second, and out after that; who that is (and so where the match's loser goes) follows from the levels;
 *   - flight C is arranged the same way: a player's first C match is C beats D (the D player drops to D).
 * When the numbers make that impossible, as few players as possible miss their flight, and the draw says so.
 * Null when levels aren't used or the field is too small (the plain drop flight is drawn instead).
 */
function levelledFlights(input: DrawInput): DrawPlan | null {
  const { event, entryIds, seeds, levelOf, clubOf, nameOf } = input;
  if (!levelOf || (event.config.pairing ?? 'balanced') === 'random' || entryIds.length < 8) return null;
  const rand = mulberry32(input.rngSeed);
  const ranking = input.lines ? entryIds : rankByLevel(entryIds, seeds, levelOf, rand);
  const rank = new Map(ranking.map((id, i) => [id, i]));
  const rankOf = (id: ID) => rank.get(id) ?? ranking.length;
  const band = (id: ID) => bandOf(levelOf(id));
  const upper = ranking.filter((id) => band(id) === 'A' || band(id) === 'B');
  const lower = ranking.filter((id) => band(id) === 'C' || band(id) === 'D');
  if (!input.lines && (!upper.length || lower.length < 2)) return null;
  const warnings: string[] = [];

  // ---- flight A ----
  // wrong flight in A: A must win their first two, B win then lose, C/D lose their first
  // A must win their first two, B win then lose, C/D lose their first
  const okA = (b: Band, first: number, second: number) =>
    b === 'A' ? first !== 2 && second !== 2 : b === 'B' ? first === 1 && second === 2 : first === 2;
  let lines: Line[];
  if (input.lines) lines = input.lines;
  else {
    const start = startLines(upper, lower, ranking.length, rankOf);
    // first fewest players outside their flight, then (never at that cost) byes for the seeds
    const fewest = improveLines(start, levelOf, rankOf, okA, rand);
    lines = canonical(seeds ? improveLines(fewest, levelOf, rankOf, okA, rand, seeds) : fewest, rankOf);
    // clubmates apart by trading players of the same level, unless that changes who is expected to win a
    // same-level match and so puts someone outside their flight
    const misses = (l: Line[]) => {
      const { results } = expectRun(l, levelOf, rankOf);
      return ranking.filter((id) => {
        const r = results.get(id) ?? [];
        return !okA(band(id), r[0] === 'W' ? 1 : r[0] === 'L' ? 2 : 0, r[1] === 'W' ? 1 : r[1] === 'L' ? 2 : 0);
      }).length;
    };
    const spread = spreadClubs({
      lines,
      seeded: new Set(ranking.slice(0, seeds)),
      clubOf,
      sameStrength: (x, y) => levelOf(x) === levelOf(y),
    });
    if (misses(spread) <= misses(lines)) lines = spread;
  }
  const p: Placement = { size: lines.length, lines, clubClashes: clashesIn(lines, clubOf) };
  warnings.push(...placementWarnings(p, nameOf, clubOf));

  const A = makeStage(event.id, 'A', 'A flight', 0, lines.length, 'A');
  const aMatches = buildBracket(A, lines.map(lineSource));
  if (collapseEmpty(aMatches)) A.numberedRounds = true;
  const runA = expectRun(lines, levelOf, rankOf);
  const at = (ms: Match[], r: number, i: number) => ms.find((m) => m.round === r && m.index === i)!;
  const toB: Match[] = [];
  const toC: { m: Match; who: ID }[] = [];
  runA.loserPlayed.forEach((lp, r) =>
    lp.forEach((n, i) => {
      const m = at(aMatches, r + 1, i);
      if (n === 0) toC.push({ m, who: runA.loserOf[r][i]! });
      else if (n === 1) toB.push(m);
    }),
  );
  const stages: Stage[] = [A];
  const matches = [...aMatches];

  const B = feederBracket(event.id, 'B', 'B flight', 1, 'B', toB, 'B flight');
  if (B) {
    stages.push(B.stage);
    matches.push(...B.matches);
  } else warnings.push('No B flight: fewer than 2 players are expected to lose their second match in A.');

  // ---- flight C: each player's first C match is C beats D ----
  const C = levelledC(event.id, toC, levelOf, rankOf, rand);
  if (C) {
    stages.push(C.stage);
    matches.push(...C.matches);
    const D = feederBracket(event.id, 'D', 'D flight', 3, 'D', C.toD, 'D flight');
    if (D) {
      stages.push(D.stage);
      matches.push(...D.matches);
    } else warnings.push('Too few players are expected to lose their first C match for a D flight.');
  } else warnings.push('Too few players are expected to lose their first match for a C flight.');

  // who is expected to finish outside their level's flight
  const finish = new Map<ID, Band>();
  for (const id of ranking) {
    const r = runA.results.get(id) ?? [];
    finish.set(id, r[0] === 'L' ? 'C' : r[1] === 'L' ? 'B' : 'A');
  }
  for (const id of C?.toDWho ?? []) finish.set(id, 'D');
  const off = ranking.filter((id) => finish.get(id) !== band(id));
  if (off.length) {
    const by = new Map<string, number>();
    for (const id of off) by.set(`${band(id)} → ${finish.get(id)}`, (by.get(`${band(id)} → ${finish.get(id)}`) ?? 0) + 1);
    warnings.push(
      `${off.length} player${off.length === 1 ? ' is' : 's are'} expected to finish outside their level's flight (${[...by]
        .map(([k, v]) => `${v} ${k}`)
        .join(', ')}): the numbers of A, B, C and D players don't allow better.`,
    );
  }
  return { stages, groups: [], matches, warnings };
}

/**
 * Flight C for the players expected to lose their first A match: arranged (byes only in its round 1) so each
 * player's first C match is C beats D: the C player stays in C, the D player drops to D.
 */
function levelledC(
  eventId: ID,
  entrants: { m: Match; who: ID }[],
  levelOf: (id: ID) => number,
  rankOf: (id: ID) => number,
  rand: () => number,
) {
  if (entrants.length < 2) return null;
  const from = new Map(entrants.map((e) => [e.who, e.m]));
  const ids = entrants.map((e) => e.who).sort((x, y) => levelOf(y) - levelOf(x) || rankOf(x) - rankOf(y));
  const isD = (id: ID) => bandOf(levelOf(id)) === 'D';
  // C must win their first C match, D lose it
  const okC = (b: Band, first: number) => (b === 'D' ? first === 2 : first === 1);
  const start = startLines(
    ids.filter((x) => !isD(x)),
    ids.filter(isD),
    ids.length,
    rankOf,
  );
  const lines = canonical(improveLines(start, levelOf, rankOf, okC, rand), rankOf);
  const stage = makeStage(eventId, 'C', 'C flight', 2, lines.length, 'C');
  const matches = buildBracket(
    stage,
    lines.map((x): SlotSource => (x === 'BYE' ? { kind: 'bye' } : { kind: 'loser', matchId: from.get(x)!.id })),
  );
  for (const e of entrants) e.m.loserTo = 'C flight';
  const run = expectRun(lines, levelOf, rankOf);
  const toD: Match[] = [];
  const toDWho: ID[] = [];
  run.loserPlayed.forEach((lp, r) =>
    lp.forEach((n, i) => {
      if (n !== 0) return;
      toD.push(matches.find((m) => m.round === r + 1 && m.index === i)!);
      toDWho.push(run.loserOf[r][i]!);
    }),
  );
  return { stage, matches, toD, toDWho };
}

/**
 * Drop flight. Everyone starts in A.
 *   ABCD (triple elimination): first-match losers → C · second-match losers → B · first-C-match losers → D.
 *   AB (double elimination): A round-1 losers → B.
 * ABCD with levels is drawn so each player lands in the flight of their level (see levelledFlights). Otherwise
 * (no levels, Random draw, A/B) C/D entries play A/B entries in A round 1 where possible (see arrangeDropFlight).
 * Lower flights are built from real losers only.
 */
function dropFlightDraw(input: DrawInput): DrawPlan {
  if (input.event.config.variant === 'PLACEMENT') return placementDraw(input);
  // tournamentsoftware's Triple Plate keeps the imported lines exactly: no level-based placement
  if (input.event.config.variant === 'ABCD' && input.event.config.layout !== 'tournamentsoftware') {
    const levelled = levelledFlights(input);
    if (levelled) return levelled;
  }
  const { event, entryIds, rngSeed, nameOf } = input;
  const rand = mulberry32(rngSeed);
  const p = place(input, rand, arrangeDropFlight);
  const S = p.size;
  const warnings = placementWarnings(p, nameOf, input.clubOf);

  const A = makeStage(event.id, 'A', 'A flight', 0, S, 'A');
  const aMatches = buildBracket(A, p.lines.map(lineSource));
  // an empty corner of the bracket is a later-round bye
  if (collapseEmpty(aMatches)) A.numberedRounds = true;
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
    const B = feederBracket(event.id, 'B', 'B flight', 1, 'B', roundOf(aMatches, 2), 'B flight');
    const C = feederBracket(event.id, 'C', 'C flight', 2, 'C', aR1, 'C flight');
    if (B) {
      stages.push(B.stage);
      matches.push(...B.matches);
    } else warnings.push('No B flight: fewer than 2 players can lose in A round 2.');
    if (C) {
      stages.push(C.stage);
      matches.push(...C.matches);
      const D = feederBracket(event.id, 'D', 'D flight', 3, 'D', roundOf(C.matches, 1), 'D flight');
      if (D) {
        stages.push(D.stage);
        matches.push(...D.matches);
      } else warnings.push('Too many byes for a D flight: fewer than 2 players can lose in C round 1.');
    } else warnings.push('Too few players lose in A round 1 for a C flight.');
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

  const warnings: string[] = [];
  // Round 1 in rank order: from the draw editor (its lines are in seed positions), or from the ranking
  let rankPairs: [ID | 'BYE', ID | 'BYE'][];
  if (input.lines) {
    const shown: [ID | 'BYE', ID | 'BYE'][] = [];
    for (let l = 0; l < input.lines.length; l += 2) shown.push([input.lines[l], input.lines[l + 1]]);
    const at = seedPositions(shown.length);
    rankPairs = at.map((p) => shown[p]);
    const extra = input.extraLines ?? [];
    for (let l = 0; l < extra.length; l += 2) rankPairs.push([extra[l], extra[l + 1] ?? 'BYE']);
    // a line emptied in the editor (or an added line left empty) isn't a match
    rankPairs = rankPairs.filter(([a, b]) => a !== 'BYE' || b !== 'BYE');
  } else {
    const random = event.config.pairing === 'random';
    const ranking = random ? [...entryIds.slice(0, seeds), ...shuffle(entryIds.slice(seeds), rand)] : entryIds;
    // With levels, every C/D entry plays an A/B entry in round 1, so a C/D entry never wins its way into the
    // upper group against another C/D. The A/B entries come first (in list order), then the C/D entries, and
    // round-1 byes are capped so enough A/B entries are left to play every C/D entry.
    const levelOf = input.levelOf;
    const isLow = (id: ID) => !random && !!levelOf && isLowerLevel(levelOf(id));
    const field = [...ranking.filter((id) => !isLow(id)), ...ranking.filter(isLow)];
    const lowCount = field.filter(isLow).length;
    const maxByes = Math.max(ranking.length % 2, ranking.length - 2 * lowCount);
    // round-1 byes for the top of the list: one for an odd field, or (round1) as many as make clean flights
    let r1Byes = ranking.length % 2;
    if (byeMode === 'round1') {
      let best = Infinity;
      for (let b = ranking.length % 2; b <= Math.min(ranking.length / 2, maxByes); b += 2) {
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
    const byes = field.slice(0, r1Byes);
    const rest = field.slice(r1Byes);
    const top = rest.slice(0, rest.length / 2);
    const bottom = rest.slice(rest.length / 2);
    if (ranked) bottom.reverse();
    // clubmates apart: swap within the bottom half, nearest first (pairs stay top v bottom), never making C/D v C/D
    const bothLow = (x: ID, y: ID) => isLow(x) && isLow(y);
    for (let i = 0; i < top.length; i++) {
      if (!sameClub(top[i], bottom[i])) continue;
      const order = bottom
        .map((_, j) => j)
        .filter((j) => j !== i)
        .sort((x, y) => Math.abs(x - i) - Math.abs(y - i));
      const j = order.find(
        (k) =>
          !sameClub(top[i], bottom[k]) &&
          !sameClub(top[k], bottom[i]) &&
          (!bothLow(top[i], bottom[k]) || bothLow(top[i], bottom[i])) &&
          (!bothLow(top[k], bottom[i]) || bothLow(top[k], bottom[k])),
      );
      if (j !== undefined) [bottom[i], bottom[j]] = [bottom[j], bottom[i]];
    }
    const lowPairs = top.filter((t, i) => bothLow(t, bottom[i])).length;
    if (lowPairs)
      warnings.push(
        `${lowPairs} round-1 match${lowPairs === 1 ? ' is' : 'es are'} between two C/D entries: there are more C/D entries than A/B entries to play them.`,
      );
    rankPairs = [...byes.map((b) => [b, 'BYE'] as [ID, 'BYE']), ...top.map((t, i) => [t, bottom[i]] as [ID, ID])];
  }

  const stages: Stage[] = [];
  const matches: Match[] = [];
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
