import { describe, expect, it } from 'vitest';

import type { Match } from '@/engine/types';

import { useStore } from '@/data/store';

/** A match with its result in. */
const finished = () => {
  const m: Match = {
    id: 'm-done',
    eventId: 'ev',
    stageId: 'st',
    number: 1,
    round: 1,
    index: 0,
    srcA: { kind: 'entry', entryId: 'e1' },
    srcB: { kind: 'entry', entryId: 'e2' },
    a: 'e1',
    b: 'e2',
    status: 'finished',
    winner: 'a',
    games: [
      [21, 10],
      [21, 12],
    ],
  };
  useStore.setState((s) => ({ matches: [...s.matches.filter((x) => x.id !== m.id), m] }));
  return m;
};

describe('match-day actions on a match that is gone or has moved on (another device changed it)', () => {
  it('report "not found" instead of throwing', () => {
    const s = useStore.getState();
    expect(() => s.callMatch('gone', 'c1')).not.toThrow();
    expect(s.saveResult('gone', { games: [[21, 10]], result: 'normal' })).toBe('Match not found.');
    expect(s.resetMatch('gone')).toBe('Match not found.');
    expect(() => s.returnToQueue('gone')).not.toThrow();
    expect(() => s.setLiveScore('gone', [], [1, 0])).not.toThrow();
  });

  it('a live score never replaces a saved result', () => {
    const done = finished();
    useStore.getState().setLiveScore(done.id, [], [3, 2]);
    expect(useStore.getState().matches.find((m) => m.id === done.id)).toEqual(done);
  });

  it('returning a finished match to the queue changes nothing and leaves no undo entry', () => {
    const done = finished();
    const updates = useStore.getState().updates.length;
    useStore.getState().returnToQueue(done.id);
    expect(useStore.getState().matches.find((m) => m.id === done.id)).toEqual(done);
    expect(useStore.getState().updates).toHaveLength(updates);
  });
});
