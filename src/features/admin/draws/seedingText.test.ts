import { describe, expect, it } from 'vitest';

import type { Entry, Player } from '@/engine/types';

import { makeLookup } from '@/data/lookup';
import { emptyDB } from '@/data/types';

import { parseSeedingText, seedingText } from '@/features/admin/draws/seedingText';

const player = (id: string, name: string, level: Player['level']): Player => ({
  id,
  name,
  gender: 'M',
  club: 'No club',
  birthYear: 1995,
  level,
});
const entry = (id: string, playerIds: string[], levels?: Entry['levels']): Entry => ({
  id,
  eventId: 'ev',
  playerIds,
  status: 'accepted',
  levels,
  createdAt: 0,
});

const db = emptyDB();
db.players = [
  player('p1', 'Jo Lin', 'A'),
  player('p2', 'Tomas Rydberg', 'B'),
  player('p3', 'Kiri D', 'C'),
  player('p4', 'Benjamin Okafor', 'D'),
  player('p5', 'Ana Ortega', 'B'),
];
db.entries = [entry('e1', ['p1']), entry('e2', ['p2']), entry('e3', ['p3']), entry('e4', ['p4']), entry('e5', ['p2', 'p5'], ['B', 'C'])];
const lk = makeLookup(db);
const order = ['e1', 'e2', 'e3', 'e4'];

describe('seeding order as text', () => {
  it('copies rank, name and level as tab-separated rows', () => {
    expect(seedingText(lk, ['e1', 'e5'])).toBe('1\tJo Lin\tA\n2\tTomas Rydberg / Ana Ortega\tB/C');
  });

  it('reads back what it copies', () => {
    const p = parseSeedingText(seedingText(lk, ['e4', 'e3', 'e2', 'e1']), lk, order);
    expect(p.order).toEqual(['e4', 'e3', 'e2', 'e1']);
    expect(p.matched).toBe(4);
    expect(p.levels).toEqual({ e4: ['D'], e3: ['C'], e2: ['B'], e1: ['A'] });
  });

  it('takes names only, short names and small typos; keeps unmentioned entries at the end', () => {
    const p = parseSeedingText('Ben Okafor\ntomas rydberrg\nSomeone Else', lk, order);
    expect(p.order).toEqual(['e4', 'e2', 'e1', 'e3']);
    expect(p.unmatched).toEqual(['Someone Else']);
    expect(p.missing).toEqual(['e1', 'e3']);
    expect(p.levels).toEqual({});
  });

  it('reads "rank. name level" and comma rows, and skips a heading row', () => {
    const p = parseSeedingText('Rank\tName\tLevel\n1. Benjamin Okafor C\nJo Lin, B', lk, order);
    expect(p.order.slice(0, 2)).toEqual(['e4', 'e1']);
    expect(p.levels).toEqual({ e4: ['C'], e1: ['B'] });
  });

  it('does not mistake a one-letter surname for a level', () => {
    const p = parseSeedingText('Kiri D', lk, order);
    expect(p.order[0]).toBe('e3');
    expect(p.levels).toEqual({});
  });

  it('ignores levels that do not fit the entry, and doubles take one level per player', () => {
    const pairs = ['e5'];
    expect(parseSeedingText('Tomas Rydberg / Ana Ortega\tA', lk, pairs).levels).toEqual({});
    expect(parseSeedingText('Tomas Rydberg / Ana Ortega\tA/B', lk, pairs).levels).toEqual({ e5: ['A', 'B'] });
  });
});
