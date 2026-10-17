import { describe, expect, it } from 'vitest';

import type { Player } from '@/engine/types';

import { applyRows, diffDB } from '@/data/remote';
import { emptyDB } from '@/data/types';

const player = (id: string, extra: Partial<Player> = {}): Player => ({
  id,
  name: id,
  gender: 'M',
  club: '',
  birthYear: 1990,
  level: 'B',
  ...extra,
});

describe('diffDB', () => {
  it('finds added, changed and removed records, and ignores copies with the same content', () => {
    const a = { ...emptyDB(), players: [player('p1'), player('p2'), player('p3')] };
    const b = {
      ...a,
      players: [player('p1'), { ...a.players[1], name: 'Renamed' }, player('p4')],
      checkIns: [{ tournamentId: 't1', playerId: 'p1', at: 1 }],
    };
    const changes = diffDB(a, b);
    expect(changes.map((c) => [c.coll, c.id, c.deleted])).toEqual([
      ['players', 'p2', false],
      ['players', 'p4', false],
      ['players', 'p3', true],
      ['checkIns', 't1:p1', false],
    ]);
  });

  it('keys draw drafts by event', () => {
    const a = emptyDB();
    const b = { ...a, drawDrafts: [{ eventId: 'ev1', base: '', seating: {}, savedAt: 1 }] };
    expect(diffDB(a, b)[0]).toMatchObject({ coll: 'drawDrafts', id: 'ev1' });
  });
});

describe('applyRows', () => {
  it('replaces in place, appends new records and drops retired ones', () => {
    const db = { ...emptyDB(), players: [player('p1'), player('p2'), player('p3')] };
    const next = applyRows(db, [
      { coll: 'players', id: 'p2', data: { ...player('p2', { name: 'New name' }) } },
      { coll: 'players', id: 'p9', data: { ...player('p9') } },
      { coll: 'players', id: 'p1', data: {}, deleted: true },
    ]);
    expect(next.players.map((p) => [p.id, p.name])).toEqual([
      ['p2', 'New name'],
      ['p3', 'p3'],
      ['p9', 'p9'],
    ]);
    expect(next.matches).toBe(db.matches);
  });

  it('keeps a contact email the device already has (public rows never carry it)', () => {
    const db = { ...emptyDB(), players: [player('p1', { email: 'a@b.co' })] };
    const next = applyRows(db, [{ coll: 'players', id: 'p1', data: { ...player('p1', { level: 'A' }) } }]);
    expect(next.players[0]).toMatchObject({ email: 'a@b.co', level: 'A' });
  });

  it('round-trips: applying a diff to the old snapshot gives the new one', () => {
    const a = { ...emptyDB(), players: [player('p1'), player('p2')] };
    const b = { ...a, players: [player('p2', { club: 'X' }), player('p5')] };
    const back = applyRows(a, diffDB(a, b));
    expect(back.players).toEqual(b.players);
  });
});
