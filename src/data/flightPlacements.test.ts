import { describe, expect, it } from 'vitest';

import { drawPlaces, isLowerFlight, rearrangeDraw, seatingOf } from '@/data/placements';
import { importTsDraws, type TsDrawFile } from '@/data/tsDraws';
import { applyTsResults } from '@/data/tsResults';
import { emptyDB } from '@/data/types';

const p = (tsId: string, name: string) => [{ tsId, name }];
// A flight, 8 lines: Ann v Bea · Cat v bye · Dee v Eve · Fay v bye
const file: TsDrawFile = {
  format: 'tournamentsoftware-draws/1',
  events: [
    {
      kind: 'WS',
      name: "Women's Singles",
      lines: [p('1', 'Ann'), p('2', 'Bea'), p('3', 'Cat'), 'BYE', p('4', 'Dee'), p('5', 'Eve'), p('6', 'Fay'), 'BYE'],
    },
  ],
};

function played() {
  const db0 = {
    ...emptyDB(),
    tournaments: [
      {
        id: 't',
        slug: 't',
        name: 'T',
        venue: '',
        city: '',
        startDate: '2026-10-17',
        endDate: '2026-10-18',
        status: 'live' as const,
        rules: 'BWF_3x21' as const,
        restMinutes: 0,
        courts: [],
        nextMatchNumber: 1,
        organizationId: 'o',
      },
    ],
  };
  const db = importTsDraws(db0, 't', file, 0).db!;
  // Ann beats Bea, Dee beats Eve (round 1); Ann beats Cat (Cat's first match); Fay beats Dee (Fay's first match, a win)
  // → flight C: Bea v Cat, Eve v bye
  return applyTsResults(db, 't', [
    { kind: 'WS', sides: [['Ann'], ['Bea']], winner: 0, games: [[30, 10]] },
    { kind: 'WS', sides: [['Dee'], ['Eve']], winner: 0, games: [[30, 10]] },
    {
      kind: 'WS',
      sides: [['Ann'], ['Cat']],
      winner: 0,
      games: [
        [21, 10],
        [21, 10],
      ],
    },
    {
      kind: 'WS',
      sides: [['Fay'], ['Dee']],
      winner: 0,
      games: [
        [21, 10],
        [21, 10],
      ],
    },
  ]).db;
}

describe('moving players in a lower flight', () => {
  const db = played();
  const C = db.stages.find((s) => s.flight === 'C')!;
  const name = (id: string | null) =>
    id && id !== 'BYE' ? db.players.find((x) => db.entries.find((e) => e.id === id)?.playerIds[0] === x.id)?.name : id;
  const entryOf = (n: string) => db.entries.find((e) => name(e.id) === n)!.id;
  const r1 = (d: typeof db) => d.matches.filter((m) => m.stageId === C.id && m.round === 1).sort((a, b) => a.index - b.index);

  it('lists the flight’s decided first-round places, not the A flight’s', () => {
    expect(isLowerFlight(db, C.id)).toBe(true);
    const places = drawPlaces(db, db.events[0].id, C.id);
    const seated = Object.values(seatingOf(places)).filter(Boolean).map(name);
    expect(seated.sort()).toEqual(['Bea', 'Cat', 'Eve']);
  });

  it('moves a player into a bye line and pins the places; nothing else changes', () => {
    const [m0, m1] = r1(db);
    expect([name(m0.a), name(m0.b)]).toEqual(['Bea', 'Cat']);
    expect([name(m1.a), m1.b]).toEqual(['Eve', 'BYE']);
    const draft = { ...seatingOf(drawPlaces(db, db.events[0].id, C.id)), [`${m0.id}:b`]: null, [`${m1.id}:b`]: entryOf('Cat') };
    const r = rearrangeDraw(db, db.events[0].id, draft, C.id);
    expect(r.error).toBeUndefined();
    const [n0, n1] = r1(r.db!);
    expect(n0.status).toBe('bye');
    expect([name(n1.a), name(n1.b)]).toEqual(['Eve', 'Cat']);
    expect(n1.status).toBe('ready');
    expect(n1.number).toBeGreaterThan(0); // a real match now: it gets a number to call and score
    // the A flight is untouched
    const A = db.stages.find((s) => s.flight === 'A')!;
    expect(r.db!.matches.filter((m) => m.stageId === A.id)).toEqual(db.matches.filter((m) => m.stageId === A.id));
  });

  it('keeps players who have started a match in this flight where they are', () => {
    const [m0] = r1(db);
    const started = { ...db, matches: db.matches.map((m) => (m.id === m0.id ? { ...m, status: 'on_court' as const, courtId: 'c1' } : m)) };
    const places = drawPlaces(started, db.events[0].id, C.id);
    expect(places.boxes.some((b) => b.id === m0.id)).toBe(false);
  });
});
