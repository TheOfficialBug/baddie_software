import { describe, expect, it } from 'vitest';

import { importTsDraws, type TsDrawFile } from '@/data/tsDraws';
import { applyTsResults } from '@/data/tsResults';
import { emptyDB } from '@/data/types';

const p = (tsId: string, name: string) => [{ tsId, name }];
// 8 lines: Ann v Bea · Cat v bye · Dee v Eve · Fay v bye
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

function draws() {
  const db = {
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
  return importTsDraws(db, 't', file, 0).db!;
}

describe('applyTsResults', () => {
  it('places results by who played whom, in any order, and keeps the site’s scores (side order included)', () => {
    const rep = applyTsResults(draws(), 't', [
      // round 2 listed before the round 1 results it depends on
      {
        kind: 'WS',
        sides: [['Cat'], ['Ann']],
        winner: 1,
        games: [
          [15, 21],
          [12, 21],
        ],
      },
      { kind: 'WS', sides: [['Bea'], ['Ann']], winner: 1, games: [[25, 30]] },
      { kind: 'WS', sides: [['Dee'], ['Eve']], winner: 0, games: [[30, 20]] },
    ]);
    expect(rep.applied).toBe(3);
    expect(rep.unmatched).toEqual([]);
    const name = (id: string | null) => rep.db.players.find((x) => rep.db.entries.find((e) => e.id === id)?.playerIds[0] === x.id)?.name;
    const r2 = rep.db.matches.find((m) => m.status === 'finished' && [name(m.a as string), name(m.b as string)].includes('Cat'))!;
    expect(name(r2[r2.winner!] as string)).toBe('Ann');
    expect(r2.games).toEqual(
      name(r2.a as string) === 'Cat'
        ? [
            [15, 21],
            [12, 21],
          ]
        : [
            [21, 15],
            [21, 12],
          ],
    );
    // Bea lost her first match: she drops to flight C (the site's Plate)
    const plate = rep.db.stages.find((s) => s.flight === 'C')!;
    expect(rep.db.matches.some((m) => m.stageId === plate.id && [name(m.a as string), name(m.b as string)].includes('Bea'))).toBe(true);
  });

  it('reports results whose players never meet in the draws', () => {
    const rep = applyTsResults(draws(), 't', [{ kind: 'WS', sides: [['Ann'], ['Fay']], winner: 0, games: [[30, 1]] }]);
    expect(rep.applied).toBe(0);
    expect(rep.unmatched).toHaveLength(1);
  });
});
