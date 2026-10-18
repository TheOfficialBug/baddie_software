import { describe, expect, it } from 'vitest';

import type { Entry, Match, SlotSource, Stage, TEvent } from '@/engine/types';

import { makeLookup } from '@/data/lookup';
import { emptyDB } from '@/data/types';

import { eventStatus } from '@/features/public/tournament/eventStatus';

const ev = { id: 'ev', tournamentId: 't1', kind: 'MS', name: 'Men’s singles' } as TEvent;
const stage: Stage = { id: 'st', eventId: 'ev', kind: 'knockout', name: 'Main draw', order: 0, size: 4, rounds: 2 };
const entry = (n: number): Entry => ({ id: `e${n}`, eventId: 'ev', playerIds: [`p${n}`], status: 'accepted', createdAt: 0 });
const match = (id: string, round: number, srcA: SlotSource, srcB: SlotSource, extra: Partial<Match> = {}): Match => ({
  id,
  eventId: 'ev',
  stageId: 'st',
  number: Number(id.slice(1)),
  round,
  index: 0,
  srcA,
  srcB,
  a: srcA.kind === 'entry' ? srcA.entryId : null,
  b: srcB.kind === 'entry' ? srcB.entryId : null,
  status: 'pending',
  games: [],
  ...extra,
});

/** Semi 1 is played (e1 beat e2), semi 2 isn't: the final waits for its second player. */
const db = {
  ...emptyDB(),
  events: [ev],
  stages: [stage],
  entries: [1, 2, 3, 4].map(entry),
  matches: [
    match(
      'm1',
      1,
      { kind: 'entry', entryId: 'e1' },
      { kind: 'entry', entryId: 'e2' },
      {
        status: 'finished',
        winner: 'a',
        games: [
          [21, 10],
          [21, 10],
        ],
      },
    ),
    match('m2', 1, { kind: 'entry', entryId: 'e3' }, { kind: 'entry', entryId: 'e4' }, { status: 'ready' }),
    match('m3', 2, { kind: 'winner', matchId: 'm1' }, { kind: 'winner', matchId: 'm2' }, { a: 'e1' }),
  ],
};

describe('eventStatus', () => {
  it('the winner whose next opponent is not known yet is waiting', () => {
    expect(eventStatus(makeLookup(db), ev, 'p1').text).toBe('Waiting for the next opponent');
  });

  it('the loser of a knockout match is finished, not waiting for an opponent', () => {
    expect(eventStatus(makeLookup(db), ev, 'p2').text).toBe('Finished');
  });

  it('a pending drop line from another first-round match does not make everyone wait', () => {
    const withPlate = {
      ...db,
      matches: [...db.matches, match('m4', 1, { kind: 'drop', matchId: 'm2', nth: 1 }, { kind: 'bye' }, { stageId: 'st' })],
    };
    expect(eventStatus(makeLookup(withPlate), ev, 'p2').text).toBe('Finished');
  });

  it('does not crash when the stage of a match is gone (a draw being redone)', () => {
    const gone = makeLookup({ ...db, stages: [{ ...stage, id: 'other' }] });
    expect(() => eventStatus(gone, ev, 'p2')).not.toThrow();
  });
});
