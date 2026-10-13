import { describe, expect, it } from 'vitest';

import type { Entry } from '@/engine/types';

import { checkInsOf, clearCheckIns, notCheckedIn, setCheckedIn } from '@/data/checkIns';
import { emptyDB } from '@/data/types';

const T = 't1';
const OTHER = 't2';

describe('check-in', () => {
  it('checks players in with the time and the staff member', () => {
    const db = setCheckedIn(emptyDB(), T, ['p1', 'p2'], true, 100, 'u-alex');
    expect(db.checkIns).toEqual([
      { tournamentId: T, playerId: 'p1', at: 100, by: 'u-alex' },
      { tournamentId: T, playerId: 'p2', at: 100, by: 'u-alex' },
    ]);
  });

  it('keeps the first check-in time when checked in again', () => {
    const once = setCheckedIn(emptyDB(), T, ['p1'], true, 100);
    const twice = setCheckedIn(once, T, ['p1', 'p2'], true, 200);
    expect(checkInsOf(twice.checkIns, T).get('p1')?.at).toBe(100);
    expect(checkInsOf(twice.checkIns, T).get('p2')?.at).toBe(200);
    expect(setCheckedIn(twice, T, ['p1'], true, 300)).toBe(twice);
  });

  it('checks players out in one tournament only', () => {
    let db = setCheckedIn(emptyDB(), T, ['p1', 'p2'], true, 100);
    db = setCheckedIn(db, OTHER, ['p1'], true, 100);
    db = setCheckedIn(db, T, ['p1'], false, 200);
    expect([...checkInsOf(db.checkIns, T).keys()]).toEqual(['p2']);
    expect([...checkInsOf(db.checkIns, OTHER).keys()]).toEqual(['p1']);
    expect(setCheckedIn(db, T, ['p1'], false, 300)).toBe(db);
  });

  it('lists the players of a match who have not checked in', () => {
    const entries = new Map<string, Entry>([
      ['e1', { id: 'e1', eventId: 'md', playerIds: ['p1', 'p2'], status: 'accepted', createdAt: 0 }],
      ['e2', { id: 'e2', eventId: 'md', playerIds: ['p3', 'p4'], status: 'accepted', createdAt: 0 }],
    ]);
    const db = setCheckedIn(emptyDB(), T, ['p1', 'p4'], true, 100);
    const marks = checkInsOf(db.checkIns, T);
    expect(notCheckedIn({ a: 'e1', b: 'e2' }, entries, marks)).toEqual(['p2', 'p3']);
    expect(notCheckedIn({ a: 'e1', b: 'BYE' }, entries, marks)).toEqual(['p2']);
    expect(notCheckedIn({ a: null, b: null }, entries, marks)).toEqual([]);
  });

  it('clears one tournament for a new day', () => {
    let db = setCheckedIn(emptyDB(), T, ['p1', 'p2'], true, 100);
    db = setCheckedIn(db, OTHER, ['p1'], true, 100);
    const cleared = clearCheckIns(db, T);
    expect(checkInsOf(cleared.checkIns, T).size).toBe(0);
    expect(checkInsOf(cleared.checkIns, OTHER).size).toBe(1);
    expect(clearCheckIns(cleared, T)).toBe(cleared);
  });
});
