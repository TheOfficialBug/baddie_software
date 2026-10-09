import { describe, expect, it } from 'vitest';

import { meetRound, spreadClubs } from './clubSpread';
import { placeKnockout } from './draws';
import { arrangeBalanced } from './pairing';
import { mulberry32 } from './rng';
import type { ID } from './types';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `e${i + 1}`);
const linesOf = (lines: (ID | 'BYE')[], who: ID[]) => who.map((id) => lines.indexOf(id));
/** Earliest round in which any two of `who` could meet. */
const earliest = (lines: (ID | 'BYE')[], who: ID[]) => {
  const ls = linesOf(lines, who);
  let r = Infinity;
  ls.forEach((a, i) => ls.slice(i + 1).forEach((b) => (r = Math.min(r, meetRound(a, b)))));
  return r;
};

describe('meetRound', () => {
  it('knows when two bracket lines meet', () => {
    expect(meetRound(0, 1)).toBe(1);
    expect(meetRound(0, 2)).toBe(2);
    expect(meetRound(0, 7)).toBe(3);
    expect(meetRound(3, 4)).toBe(3);
    expect(meetRound(0, 15)).toBe(4);
  });
});

describe('spreading clubmates through a draw', () => {
  it('puts two clubmates in different halves, so they can only meet in the final', () => {
    const all = ids(16);
    const club = new Set(['e5', 'e9']);
    const clubOf = (id: ID) => (club.has(id) ? 'Alpha' : `solo-${id}`);
    for (let s = 1; s <= 30; s++) {
      const lot = placeKnockout([], all, mulberry32(s), clubOf);
      const out = spreadClubs({ lines: lot.lines, seeded: new Set(), clubOf });
      expect(earliest(out, [...club])).toBe(4);
    }
  });

  it('puts four clubmates in four different quarters', () => {
    const all = ids(32);
    const club = ['e3', 'e8', 'e13', 'e21'];
    const clubOf = (id: ID) => (club.includes(id) ? 'Alpha' : undefined);
    for (let s = 1; s <= 30; s++) {
      const lot = placeKnockout([], all, mulberry32(s), clubOf);
      const out = spreadClubs({ lines: lot.lines, seeded: new Set(), clubOf });
      expect(earliest(out, club)).toBeGreaterThanOrEqual(4);
    }
  });

  it('never moves a seed', () => {
    const all = ids(24);
    const seeds = all.slice(0, 8);
    const clubOf = (id: ID) => (Number(id.slice(1)) % 3 === 0 ? 'Alpha' : Number(id.slice(1)) % 5 === 0 ? 'Beta' : undefined);
    for (let s = 1; s <= 20; s++) {
      const lot = placeKnockout(seeds, all.slice(8), mulberry32(s), clubOf);
      const out = spreadClubs({ lines: lot.lines, seeded: new Set(seeds), clubOf });
      expect(linesOf(out, seeds)).toEqual(linesOf(lot.lines, seeds));
      // byes stay on the same lines
      expect(out.map((v) => v === 'BYE')).toEqual(lot.lines.map((v) => v === 'BYE'));
    }
  });

  it('in a level-balanced draw only same-level players trade places, so every match-up stays', () => {
    const all = ids(28);
    const level = (id: ID) => 4 - (Number(id.slice(1)) % 4); // A–D mixed
    const clubOf = (id: ID) => (Number(id.slice(1)) % 7 === 0 ? 'Alpha' : Number(id.slice(1)) % 6 === 0 ? 'Beta' : undefined);
    const matchups = (lines: (ID | 'BYE')[]) =>
      Array.from({ length: lines.length / 2 }, (_, k) =>
        [lines[2 * k], lines[2 * k + 1]]
          .map((v) => (v === 'BYE' ? 'bye' : String(level(v))))
          .sort()
          .join('-'),
      ).sort();
    for (let s = 1; s <= 20; s++) {
      const a = arrangeBalanced({ entryIds: all, seeds: 4, levelOf: level, clubOf, pairing: 'balanced', rand: mulberry32(s) });
      const out = spreadClubs({ lines: a.lines, seeded: new Set(all.slice(0, 4)), clubOf, sameStrength: (x, y) => level(x) === level(y) });
      expect(matchups(out)).toEqual(matchups(a.lines));
    }
  });

  it('when a club is too big to keep apart, they still meet as late as possible', () => {
    // 6 of 8 from one club: two first-round meetings are unavoidable, but no more
    const all = ids(8);
    const clubOf = (id: ID) => (Number(id.slice(1)) <= 6 ? 'Alpha' : undefined);
    for (let s = 1; s <= 20; s++) {
      const lot = placeKnockout([], all, mulberry32(s), clubOf);
      const out = spreadClubs({ lines: lot.lines, seeded: new Set(), clubOf });
      let r1 = 0;
      for (let l = 0; l < 8; l += 2) if (clubOf(out[l] as ID) && clubOf(out[l] as ID) === clubOf(out[l + 1] as ID)) r1++;
      expect(r1).toBe(2);
    }
  });
});
