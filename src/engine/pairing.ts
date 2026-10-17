// Level- and club-aware placement for knockout draws (club tournaments).
//
// Goal: competitive first rounds and no same-club meetings.
//   1. Rank every entry: seeds first (admin's order), then by skill level (A > B > C > D),
//      ties within a level drawn by lot.
//   2. Top-ranked entries get the byes (BWF practice), except when the entries left to play
//      round 1 are mostly one level: then the lowest-ranked unseeded bye-holders of other levels
//      play instead, so round 1 isn't level-against-same-level (seeds always keep their byes).
//   3. Everyone else is split into a top half and a bottom half and paired in order:
//        balanced: top[i] vs bottom[i]   → with levels A,B | C,D this gives A–C and B–D
//        classic:  top[i] vs bottom[last-i] → A–D and B–C (strongest meets weakest)
//   4. Same-club pairs are fixed by swapping with the nearest-ranked entry in the same half
//      that removes the clash without making a same-level pair (if possible). Leftovers are reported.
//   5. Pairs (and bye-holders) are placed on the draw's seed lines in rank order, so the
//      strongest pairs land in different halves/quarters exactly like seeds; equal-tier
//      positions are drawn by lot.
// Works for any entry count: uneven numbers become byes, uneven level mixes just shift
// which levels meet (the ranking is always respected).
import { nextPow2, seedLines } from './draws';
import { shuffle } from './rng';
import type { ID } from './types';

export type Pairing = 'balanced' | 'classic' | 'random';

export interface ArrangeInput {
  /** entries in seed order; the first `seeds` keep this order, the rest are re-ranked by level */
  entryIds: ID[];
  seeds: number;
  /** higher = stronger (A=4 … D=1); doubles use the pair average */
  levelOf: (id: ID) => number;
  clubOf: (id: ID) => string | undefined;
  pairing: Exclude<Pairing, 'random'>;
  rand: () => number;
}

export interface Arrangement {
  size: number;
  lines: (ID | 'BYE')[];
  clubClashes: [ID, ID][];
  /** the ranking actually used (seeds, then level, ties by lot) */
  ranking: ID[];
}

export function rankByLevel(entryIds: ID[], seeds: number, levelOf: (id: ID) => number, rand: () => number): ID[] {
  const seeded = entryIds.slice(0, seeds);
  const rest = shuffle(entryIds.slice(seeds), rand).sort((a, b) => levelOf(b) - levelOf(a));
  return [...seeded, ...rest];
}

/**
 * Who gets the byes: the top of the ranking, unless that leaves round 1 mostly one level (more than
 * half the players). Then pool entries of that level swap with the lowest-ranked unseeded bye-holders
 * of other levels until no level is more than half, so pairs can be of different levels.
 */
export function chooseByes(
  ranking: ID[],
  seeds: number,
  byes: number,
  levelOf: (id: ID) => number,
  clubOf: (id: ID) => string | undefined = () => undefined,
): { byeHolders: ID[]; players: ID[] } {
  const rankOf = new Map(ranking.map((id, i) => [id, i]));
  const byeHolders = ranking.slice(0, byes);
  const players = ranking.slice(byes);
  // clubmates can be kept apart only while no club has more than half of round 1
  const biggestClub = (ids: ID[]) => {
    const n = new Map<string, number>();
    for (const id of ids) {
      const c = clubOf(id);
      if (c) n.set(c, (n.get(c) ?? 0) + 1);
    }
    return Math.max(0, ...n.values());
  };
  for (;;) {
    const counts = new Map<number, number>();
    for (const id of players) counts.set(levelOf(id), (counts.get(levelOf(id)) ?? 0) + 1);
    const crowded = [...counts].find(([, n]) => n > players.length / 2)?.[0];
    if (crowded === undefined) break;
    // the lowest-ranked unseeded bye-holder of another level plays instead of the best-ranked crowded
    // player, unless that would put too many clubmates in round 1
    const outIdx = players.findIndex((id) => levelOf(id) === crowded);
    const clubsOk = biggestClub(players) <= players.length / 2;
    let inIdx = byeHolders.length - 1;
    for (; inIdx >= 0; inIdx--) {
      const id = byeHolders[inIdx];
      if (rankOf.get(id)! < seeds || levelOf(id) === crowded) continue;
      const trial = players.map((p, i) => (i === outIdx ? id : p));
      if (!clubsOk || biggestClub(trial) <= trial.length / 2) break;
    }
    if (inIdx < 0) break;
    [byeHolders[inIdx], players[outIdx]] = [players[outIdx], byeHolders[inIdx]];
  }
  const byRank = (a: ID, b: ID) => rankOf.get(a)! - rankOf.get(b)!;
  return { byeHolders: byeHolders.sort(byRank), players: players.sort(byRank) };
}

export function arrangeBalanced({ entryIds, seeds, levelOf, clubOf, pairing, rand }: ArrangeInput): Arrangement {
  const ranking = rankByLevel(entryIds, seeds, levelOf, rand);
  const N = ranking.length;
  const S = nextPow2(N);
  const { byeHolders, players } = chooseByes(ranking, seeds, S - N, levelOf, clubOf); // players: even count
  const half = players.length / 2;
  const top = players.slice(0, half);
  const bottom = players.slice(half);
  if (pairing === 'classic') bottom.reverse();

  const sameClub = (x: ID, y: ID) => {
    const c = clubOf(x);
    return !!c && c === clubOf(y);
  };

  const sameLevel = (x: ID, y: ID) => levelOf(x) === levelOf(y);

  // Fix club clashes with the smallest possible change: swap bottom-half partners,
  // nearest rank first, preferring swaps that don't create a same-level pair; if that can't work, try the top half.
  const fix = (side: ID[], other: ID[], i: number) => {
    const order = side
      .map((_, j) => j)
      .filter((j) => j !== i)
      .sort((p, q) => Math.abs(p - i) - Math.abs(q - i));
    for (const strict of [true, false]) {
      for (const j of order) {
        const ok = !sameClub(other[i], side[j]) && !sameClub(other[j], side[i]);
        const levelsOk =
          !strict ||
          ((!sameLevel(other[i], side[j]) || sameLevel(other[i], side[i])) &&
            (!sameLevel(other[j], side[i]) || sameLevel(other[j], side[j])));
        if (ok && levelsOk) {
          [side[i], side[j]] = [side[j], side[i]];
          return true;
        }
      }
    }
    return false;
  };
  for (let i = 0; i < half; i++) {
    if (sameClub(top[i], bottom[i]) && !fix(bottom, top, i)) fix(top, bottom, i);
  }

  // Units in rank order: bye-holders first, then pairs by their stronger member.
  type Unit = { anchor: ID; partner: ID | 'BYE' };
  const units: Unit[] = [
    ...byeHolders.map((id) => ({ anchor: id, partner: 'BYE' as const })),
    ...top.map((id, i) => ({ anchor: id, partner: bottom[i] })),
  ];
  const rankOf = new Map(ranking.map((id, i) => [id, i]));
  units.sort((u, v) => rankOf.get(u.anchor)! - rankOf.get(v.anchor)!);

  // Seed lines for units 1..S/2. Tiers [1], [2], [3-4], [5-8]… are drawn by lot within the tier.
  const lineOf = seedLines(S);
  const slots = Array.from({ length: S / 2 }, (_, k) => lineOf[k]);
  const tiered: number[] = [];
  let lo = 0;
  while (lo < slots.length) {
    const size = lo < 2 ? 1 : lo; // tiers: 1 | 2 | 3–4 | 5–8 | 9–16 …
    tiered.push(...shuffle(slots.slice(lo, lo + size), rand));
    lo += size;
  }

  const lines: (ID | 'BYE')[] = new Array(S).fill('BYE');
  units.forEach((u, k) => {
    const line = tiered[k];
    lines[line] = u.anchor;
    lines[line ^ 1] = u.partner;
  });

  const clubClashes: [ID, ID][] = [];
  for (let l = 0; l < S; l += 2) {
    const a = lines[l];
    const b = lines[l + 1];
    if (a !== 'BYE' && b !== 'BYE' && sameClub(a, b)) clubClashes.push([a, b]);
  }
  return { size: S, lines, clubClashes, ranking };
}

/** C and D (and C/D pairs): the entries that should lose their way out of flight A in round 1. */
export const isLowerLevel = (level: number) => level <= 2;

/**
 * Drop flight, flight A: C/D entries play A/B entries in round 1 wherever possible.
 *   byes 'round1' (default): round 1 has the usual N − S/2 matches and the top of the ranking (A/B first) gets
 *   the byes; the A/B entries left take the C/D entries, and any C/D entries beyond that meet each other.
 *   byes 'round2': round 1 grows to one match per C/D entry (when there are more of them than N − S/2), fewer
 *   top players get round-1 byes, and the draw takes the remaining byes in round 2 instead, split so that
 *   round 2 is A v B where possible. Only when C/D entries outnumber A/B entries do some of them meet.
 *   Nobody gets two byes. C/D v C/D matches are reported.
 *   Pairing: the A/B entries in round 1 are the top half, the bottom half holds every C/D entry;
 *   balanced pairs top[i] v bottom[i], classic top[i] v bottom[last − i].
 * Lines are for a draw of 2 × (round-2 size); a round-1 pair of byes stands for a round-2 bye.
 */
export function arrangeDropFlight({
  entryIds,
  seeds,
  levelOf,
  clubOf,
  pairing,
  rand,
}: ArrangeInput): Arrangement & { lowerClashes: number } {
  const ranking = rankByLevel(entryIds, seeds, levelOf, rand);
  const N = ranking.length;
  if (N <= 2) return { size: 2, lines: [ranking[0], ranking[1] ?? 'BYE'], clubClashes: [], ranking, lowerClashes: 0 };
  const rankOf = new Map(ranking.map((id, i) => [id, i]));
  const byRank = (a: ID, b: ID) => rankOf.get(a)! - rankOf.get(b)!;
  const lower = ranking.filter((id) => isLowerLevel(levelOf(id)));
  const upper = ranking.filter((id) => !isLowerLevel(levelOf(id)));
  const L = lower.length;

  // round-1 matches: the usual N − S/2, or one per C/D entry when there are more of them
  const m0 = N - nextPow2(N) / 2;
  const m1 = Math.min(Math.floor(N / 2), Math.max(m0, L));
  const field = [...upper, ...lower]; // A/B first, then C/D, each in rank order
  const byeHolders = field.slice(0, N - 2 * m1);
  const players = field.slice(byeHolders.length);
  const top = players.slice(0, m1);
  const bottom = players.slice(m1);
  if (pairing === 'classic') bottom.reverse();

  // clubmates apart: swap bottom-half partners, nearest first; keep C/D entries away from each other
  const sameClub = (x: ID, y: ID) => !!clubOf(x) && clubOf(x) === clubOf(y);
  const bothLower = (x: ID, y: ID) => isLowerLevel(levelOf(x)) && isLowerLevel(levelOf(y));
  for (let i = 0; i < m1; i++) {
    if (!sameClub(top[i], bottom[i])) continue;
    const j = bottom
      .map((_, k) => k)
      .filter((k) => k !== i)
      .sort((p, q) => Math.abs(p - i) - Math.abs(q - i))
      .find(
        (k) =>
          !sameClub(top[i], bottom[k]) &&
          !sameClub(top[k], bottom[i]) &&
          (!bothLower(top[i], bottom[k]) || bothLower(top[i], bottom[i])) &&
          (!bothLower(top[k], bottom[i]) || bothLower(top[k], bottom[k])),
      );
    if (j !== undefined) [bottom[i], bottom[j]] = [bottom[j], bottom[i]];
  }
  const lowerClashes = top.filter((t, i) => bothLower(t, bottom[i])).length;

  // Round 2: units are round-1 bye holders and round-1 matches, by their best-ranked player.
  type Unit = { anchor: ID; lines: [ID | 'BYE', ID | 'BYE'] };
  const byeUnits: Unit[] = byeHolders.map((id) => ({ anchor: id, lines: [id, 'BYE'] }));
  const matchUnits: Unit[] = top
    .map((t, i) => [t, bottom[i]].sort(byRank) as [ID, ID])
    .map(([a, b]): Unit => ({ anchor: a, lines: [a, b] }))
    .sort((u, v) => byRank(u.anchor, v.anchor));
  const W = byeUnits.length + matchUnits.length;
  const S2 = nextPow2(W);
  // Round-2 byes go to round-1 matches (never to someone who already had a bye). They're split between the
  // top band (e.g. A players) and the rest so that those who play round 2 are half each: then the top band
  // meets the rest (A v B) instead of the byes all going to the A players and the B players meeting each other.
  // Within each band the best-ranked skip first.
  const b2 = S2 - W;
  const units = [...byeUnits, ...matchUnits];
  const topLevel = Math.max(...units.map((u) => levelOf(u.anchor)));
  const isTop = (u: Unit) => levelOf(u.anchor) > topLevel - 1;
  const topM = matchUnits.filter(isTop);
  const restM = matchUnits.filter((u) => !isTop(u));
  const wanted = units.filter(isTop).length - (W - b2) / 2;
  const x = Math.min(topM.length, b2, Math.max(0, b2 - restM.length, Math.round(wanted)));
  const skip = [...topM.slice(0, x), ...restM.slice(0, b2 - x)];
  // the rest play round 2, best-ranked against worst-ranked
  const rest = units.filter((u) => !skip.includes(u)).sort((u, v) => byRank(u.anchor, v.anchor));
  const empty: Unit = { anchor: '', lines: ['BYE', 'BYE'] };
  const r2: [Unit, Unit][] = [
    ...skip.map((u) => [u, empty] as [Unit, Unit]),
    ...rest.slice(0, rest.length / 2).map((u, i) => [u, rest[rest.length - 1 - i]] as [Unit, Unit]),
  ].sort((x, y) => byRank(x[0].anchor, y[0].anchor));

  // round-2 matches on seed positions (tiers [1], [2], [3–4], [5–8]… drawn by lot)
  const count = S2 / 2;
  const lineOf = count === 1 ? [0] : seedLines(count);
  const tiered: number[] = [];
  for (let lo = 0; lo < count; lo += lo < 2 ? 1 : lo) tiered.push(...shuffle(lineOf.slice(lo, lo + (lo < 2 ? 1 : lo)), rand));
  const lines: (ID | 'BYE')[] = new Array(2 * S2).fill('BYE');
  r2.forEach(([a, b], k) => {
    const at = 4 * tiered[k];
    [lines[at], lines[at + 1], lines[at + 2], lines[at + 3]] = [...a.lines, ...b.lines];
  });

  const clubClashes: [ID, ID][] = [];
  for (let l = 0; l < lines.length; l += 2) {
    const [a, b] = [lines[l], lines[l + 1]];
    if (a !== 'BYE' && b !== 'BYE' && sameClub(a, b)) clubClashes.push([a, b]);
  }
  return { size: 2 * S2, lines, clubClashes, ranking, lowerClashes };
}

/** Letter grade → number used for ranking (A strongest). */
export const LEVEL_VALUE: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };

/** Round-robin group balance: move same-club entries apart by swapping with same-tier entries in other groups. */
export function separateGroups(groups: ID[][], clubOf: (id: ID) => string | undefined): ID[][] {
  const g = groups.map((x) => x.slice());
  const clashes = (gi: number, id: ID, ignore?: ID) => {
    const c = clubOf(id);
    return !!c && g[gi].some((o) => o !== id && o !== ignore && clubOf(o) === c);
  };
  for (let gi = 0; gi < g.length; gi++) {
    for (let pos = 0; pos < g[gi].length; pos++) {
      const id = g[gi][pos];
      if (!clashes(gi, id)) continue;
      // same tier = same position in the snake (similar strength)
      for (let gj = 0; gj < g.length; gj++) {
        if (gj === gi || pos >= g[gj].length) continue;
        const other = g[gj][pos];
        if (!clashes(gj, id, other) && !clashes(gi, other, id)) {
          g[gi][pos] = other;
          g[gj][pos] = id;
          break;
        }
      }
    }
  }
  return g;
}
