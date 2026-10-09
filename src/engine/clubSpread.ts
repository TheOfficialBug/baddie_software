// Keep clubmates apart for as long as the draw allows (BWF GCR 11.11 spirit: players of the same
// club go into different halves, then different quarters, …), without bending the draw:
//   • seeds never move;
//   • only two unseeded entries of the same strength trade places, so the level match-ups,
//     who gets a bye and the seeding all stay exactly as drawn;
//   • when a club has more players than the draw has sections, they meet as late as possible.
import type { ID } from './types';

/** Round in which bracket lines a and b would meet (1 = first round). */
export const meetRound = (a: number, b: number) => 32 - Math.clz32(a ^ b);

export interface SpreadInput {
  lines: (ID | 'BYE')[];
  seeded: Set<ID>;
  clubOf: (id: ID) => string | undefined;
  /** Entries may trade places only when this holds (e.g. same skill level). Default: any two. */
  sameStrength?: (a: ID, b: ID) => boolean;
}

/** Returns new lines with clubmates spread out; the input is not changed. */
export function spreadClubs({ lines, seeded, clubOf, sameStrength = () => true }: SpreadInput): (ID | 'BYE')[] {
  const out = lines.slice();
  const rounds = Math.log2(out.length);
  // An early meeting costs more than every later one together: round 1 ≫ round 2 ≫ …
  const weight = (r: number) => 4 ** (rounds - r);

  const pos = new Map<ID, number>();
  const byClub = new Map<string, ID[]>();
  out.forEach((v, line) => {
    if (v === 'BYE') return;
    pos.set(v, line);
    const c = clubOf(v);
    if (c) byClub.set(c, [...(byClub.get(c) ?? []), v]);
  });
  const clubs = [...byClub.values()].filter((ids) => ids.length > 1);
  if (!clubs.length) return out;

  /** What entry `id` costs standing on `line`, against its clubmates (`moved` is the entry it trades with). */
  const costAt = (id: ID, line: number, moved: ID) => {
    const c = clubOf(id);
    if (!c) return 0;
    let sum = 0;
    for (const mate of byClub.get(c) ?? []) {
      if (mate === id) continue;
      // the trading partner ends up where `id` stands now
      const at = mate === moved ? pos.get(id)! : pos.get(mate)!;
      sum += weight(meetRound(line, at));
    }
    return sum;
  };
  const movable = (id: ID) => !seeded.has(id);

  for (let pass = 0; pass < 8; pass++) {
    let improved = false;
    for (const ids of clubs) {
      for (const x of ids) {
        if (!movable(x)) continue;
        const i = pos.get(x)!;
        let best = 0;
        let bestY: ID | null = null;
        for (const [y, j] of pos) {
          if (y === x || (j ^ 1) === i || !movable(y) || clubOf(y) === clubOf(x) || !sameStrength(x, y)) continue;
          const before = costAt(x, i, y) + costAt(y, j, x);
          const after = costAt(x, j, y) + costAt(y, i, x);
          if (after - before < best) {
            best = after - before;
            bestY = y;
          }
        }
        if (bestY) {
          const j = pos.get(bestY)!;
          out[i] = bestY;
          out[j] = x;
          pos.set(x, j);
          pos.set(bestY, i);
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return out;
}
