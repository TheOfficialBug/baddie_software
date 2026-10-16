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
