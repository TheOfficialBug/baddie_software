import { describe, expect, it } from 'vitest';

import { checkCall, playerStatuses, readyQueue } from './scheduler';
import type { Court, Entry, ID, Match, MatchStatus } from './types';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 10, 12, 0);
const REST = 15;

/** entry id → player ids. `d1` is a doubles pair that shares player p1 with singles entry `e1`. */
const ENTRY_PLAYERS: Record<ID, ID[]> = {
  e1: ['p1'],
  e2: ['p2'],
  e3: ['p3'],
  e4: ['p4'],
  e5: ['p5'],
  e6: ['p6'],
  e7: ['p7'],
  e8: ['p8'],
  d1: ['p1', 'p9'],
  d2: ['p10', 'p11'],
};
const entries = new Map<ID, Entry>(
  Object.entries(ENTRY_PLAYERS).map(([id, playerIds]) => [
    id,
    { id, eventId: id.startsWith('d') ? 'xd' : 'ms', playerIds, status: 'accepted', createdAt: 0 },
  ]),
);
const playerName = (id: ID) => `Player ${id.slice(1)}`;
const courts: Court[] = [
  { id: 'c1', name: 'Court 1' },
  { id: 'c2', name: 'Court 2' },
];

function match(id: ID, a: ID, b: ID, status: MatchStatus, number: number, extra: Partial<Match> = {}): Match {
  return {
    id,
    eventId: 'ms',
    stageId: 'ms-main',
    number,
    round: 1,
    index: 0,
    srcA: { kind: 'entry', entryId: a },
    srcB: { kind: 'entry', entryId: b },
    a,
    b,
    status,
    games: [],
    live: null,
    ...extra,
  };
}

const queue = (matches: Match[], restMinutes = REST) => readyQueue(matches, entries, playerName, courts, NOW, restMinutes);
const ids = (q: ReturnType<typeof readyQueue>) => q.map((x) => x.match.id);

// ---------------------------------------------------------------------------
// readyQueue
// ---------------------------------------------------------------------------

describe('readyQueue', () => {
  it('lists only ready matches, by match number', () => {
    const q = queue([
      match('m3', 'e5', 'e6', 'ready', 3),
      match('m1', 'e1', 'e2', 'pending', 1),
      match('m2', 'e3', 'e4', 'ready', 2),
      match('m4', 'e7', 'e8', 'finished', 4, { finishedAt: NOW - 60 * MIN }),
    ]);
    expect(ids(q)).toEqual(['m2', 'm3']);
    expect(q.every((x) => !x.blocked && !x.resting)).toBe(true);
  });

  it('blocks a match when one of its players is on court in another match', () => {
    const q = queue([
      match('m1', 'e1', 'e2', 'on_court', 1, { courtId: 'c2', calledAt: NOW - 10 * MIN }),
      match('m2', 'e1', 'e3', 'ready', 2),
    ]);
    expect(q).toHaveLength(1);
    expect(q[0].blocked).toBe('Player 1 is on Court 2');
  });

  it('blocks across events when a doubles partner is on court in singles', () => {
    const q = queue([match('m1', 'e1', 'e2', 'on_court', 1, { courtId: 'c1' }), match('x1', 'd1', 'd2', 'ready', 2, { eventId: 'xd' })]);
    expect(q[0].blocked).toBe('Player 1 is on Court 1');
  });

  it('marks a player as resting when they finished less than restMinutes ago', () => {
    const q = queue([
      match('m1', 'e3', 'e4', 'finished', 1, {
        finishedAt: NOW - 5 * MIN,
        winner: 'a',
        games: [
          [21, 10],
          [21, 10],
        ],
      }),
      match('m2', 'e3', 'e5', 'ready', 2),
    ]);
    expect(q[0].blocked).toBeUndefined();
    expect(q[0].resting).toEqual({ name: 'Player 3', minutesLeft: 10 });
  });

  it.each([
    ['rest is over', 20 * MIN, 'normal'],
    ['exactly at the rest limit', 15 * MIN, 'normal'],
    ['a walkover is not a match played', 1 * MIN, 'walkover'],
  ] as const)('no rest needed when %s', (_label, ago, result) => {
    const q = queue([
      match('m1', 'e3', 'e4', 'finished', 1, { finishedAt: NOW - ago, winner: 'a', result }),
      match('m2', 'e3', 'e5', 'ready', 2),
    ]);
    expect(q[0].resting).toBeUndefined();
  });

  it('reports the player who needs the longest rest', () => {
    const q = queue([
      match('m1', 'e3', 'e7', 'finished', 1, { finishedAt: NOW - 12 * MIN, winner: 'a' }),
      match('m2', 'e4', 'e8', 'finished', 2, { finishedAt: NOW - 2 * MIN, winner: 'a' }),
      match('m3', 'e3', 'e4', 'ready', 3),
    ]);
    expect(q[0].resting).toEqual({ name: 'Player 4', minutesLeft: 13 });
  });

  it('sorts free matches first, then resting, then blocked; by number within each', () => {
    const q = queue([
      match('busy', 'e1', 'e2', 'on_court', 1, { courtId: 'c1' }),
      match('done', 'e3', 'e4', 'finished', 2, { finishedAt: NOW - 3 * MIN, winner: 'a' }),
      match('blocked', 'e1', 'e5', 'ready', 3),
      match('resting', 'e3', 'e6', 'ready', 4),
      match('free-late', 'e7', 'e8', 'ready', 9),
      match('free-early', 'e5', 'e6', 'ready', 5),
    ]);
    expect(ids(q)).toEqual(['free-early', 'free-late', 'resting', 'blocked']);
    expect(q.map((x) => (x.blocked ? 'blocked' : x.resting ? 'resting' : 'free'))).toEqual(['free', 'free', 'resting', 'blocked']);
  });
});

// ---------------------------------------------------------------------------
// playerStatuses / checkCall
// ---------------------------------------------------------------------------

const finished = (id: ID, a: ID, b: ID, minutesAgo: number, extra: Partial<Match> = {}) =>
  match(id, a, b, 'finished', 0, {
    finishedAt: NOW - minutesAgo * MIN,
    winner: 'a',
    games: [
      [21, 10],
      [21, 10],
    ],
    result: 'normal',
    ...extra,
  });

describe('playerStatuses', () => {
  const statuses = (matches: Match[]) => playerStatuses(matches, entries, NOW, REST);

  it('lists every accepted entry’s players; "done" with 0 played when they have no matches', () => {
    const st = statuses([]);
    expect([...st.keys()].sort()).toEqual(['p1', 'p10', 'p11', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
    expect(st.get('p7')).toMatchObject({ state: 'done', played: 0 });
  });

  it('on court: state, match and since (startedAt, else calledAt)', () => {
    const called = match('m1', 'e1', 'e2', 'on_court', 1, { courtId: 'c1', calledAt: NOW - 6 * MIN });
    const started = match('m2', 'e3', 'e4', 'on_court', 2, { courtId: 'c2', calledAt: NOW - 9 * MIN, startedAt: NOW - 7 * MIN });
    const st = statuses([called, started]);
    expect(st.get('p1')).toMatchObject({ state: 'on_court', match: called, since: NOW - 6 * MIN });
    expect(st.get('p2')).toMatchObject({ state: 'on_court', match: called });
    expect(st.get('p3')).toMatchObject({ state: 'on_court', match: started, since: NOW - 7 * MIN });
  });

  it('resting: finished less than restMinutes ago and in a ready match', () => {
    const next = match('m2', 'e3', 'e5', 'ready', 2);
    const st = statuses([finished('m1', 'e3', 'e4', 5), next]);
    expect(st.get('p3')).toMatchObject({ state: 'resting', match: next, restLeft: 10, lastFinishedAt: NOW - 5 * MIN, played: 1 });
    expect(st.get('p5')).toMatchObject({ state: 'ready', match: next });
    expect(st.get('p5')!.restLeft).toBeUndefined();
  });

  it('ready: in a ready match and rested', () => {
    const next = match('m2', 'e3', 'e5', 'ready', 2);
    expect(statuses([finished('m1', 'e3', 'e4', 20), next]).get('p3')).toMatchObject({ state: 'ready', match: next, played: 1 });
  });

  it('waiting: only in a pending match', () => {
    const later = match('m3', 'e6', 'e7', 'pending', 3);
    expect(statuses([later]).get('p6')).toMatchObject({ state: 'waiting', match: later });
  });

  it('done: no unfinished matches left', () => {
    const st = statuses([finished('m1', 'e3', 'e4', 30), finished('m2', 'e3', 'e5', 2)]);
    expect(st.get('p3')).toMatchObject({ state: 'done', played: 2, lastFinishedAt: NOW - 2 * MIN });
    expect(st.get('p4')).toMatchObject({ state: 'done', played: 1 });
  });

  it('on court in one event wins over a ready match in another (either order)', () => {
    const singles = match('m1', 'e1', 'e2', 'on_court', 5, { courtId: 'c1' });
    const mixed = match('x1', 'd1', 'd2', 'ready', 1, { eventId: 'xd' });
    for (const order of [
      [singles, mixed],
      [mixed, singles],
    ]) {
      const st = statuses(order);
      expect(st.get('p1')).toMatchObject({ state: 'on_court', match: singles });
      expect(st.get('p9')).toMatchObject({ state: 'ready', match: mixed });
    }
  });

  it('ready wins over waiting; between two ready matches the lower number is shown', () => {
    const pending = match('m1', 'e1', 'e2', 'pending', 1);
    const late = match('m9', 'e1', 'e3', 'ready', 9);
    const early = match('m4', 'e1', 'e4', 'ready', 4);
    expect(statuses([pending, late, early]).get('p1')).toMatchObject({ state: 'ready', match: early });
  });

  it('played counts finished matches but not walkovers', () => {
    const st = statuses([
      finished('m1', 'e3', 'e4', 60),
      finished('m2', 'e3', 'e5', 40),
      finished('m3', 'e3', 'e6', 30, { result: 'walkover', games: [] }),
      finished('m4', 'e3', 'e7', 20, {
        result: 'retired',
        games: [
          [21, 10],
          [5, 3],
        ],
      }),
      match('m5', 'e3', 'e8', 'ready', 5),
    ]);
    expect(st.get('p3')!.played).toBe(3);
    expect(st.get('p6')!.played).toBe(0);
  });

  it('a walkover is not a match played, so it needs no rest (same as readyQueue)', () => {
    const next = match('m2', 'e3', 'e5', 'ready', 2);
    const wo = finished('m1', 'e3', 'e4', 1, { result: 'walkover', games: [] });
    expect(queue([wo, next])[0].resting).toBeUndefined();
    expect(statuses([wo, next]).get('p3')).toMatchObject({ state: 'ready' });
    expect(checkCall(next, [wo, next], entries, NOW, REST).resting).toEqual([]);
  });
});

describe('checkCall', () => {
  it('reports a player who is on court in another match as busy', () => {
    const onCourt = match('m1', 'e1', 'e2', 'on_court', 1, { courtId: 'c1' });
    const next = match('m2', 'e1', 'e3', 'ready', 2);
    const c = checkCall(next, [onCourt, next], entries, NOW, REST);
    expect(c.busy).toEqual([{ playerId: 'p1', match: onCourt }]);
    expect(c.resting).toEqual([]);
  });

  it('catches a doubles partner who is on court in singles', () => {
    const onCourt = match('m1', 'e1', 'e2', 'on_court', 1, { courtId: 'c1' });
    const mixed = match('x1', 'd1', 'd2', 'ready', 2, { eventId: 'xd' });
    expect(checkCall(mixed, [onCourt, mixed], entries, NOW, REST).busy).toEqual([{ playerId: 'p1', match: onCourt }]);
  });

  it('reports players who have not had their minimum rest', () => {
    const next = match('m2', 'e3', 'e5', 'ready', 2);
    const c = checkCall(next, [finished('m1', 'e3', 'e4', 5), finished('m0', 'e5', 'e6', 12), next], entries, NOW, REST);
    expect(c.busy).toEqual([]);
    expect(c.resting).toEqual([
      { playerId: 'p3', minutesLeft: 10 },
      { playerId: 'p5', minutesLeft: 3 },
    ]);
  });

  it('is clear for rested players who are not on court', () => {
    const next = match('m2', 'e3', 'e5', 'ready', 2);
    expect(checkCall(next, [finished('m1', 'e3', 'e4', 30), next], entries, NOW, REST)).toEqual({ busy: [], resting: [] });
  });

  it('does not report the match itself as busy once it is on court', () => {
    const live = match('m1', 'e1', 'e2', 'on_court', 1, { courtId: 'c1' });
    expect(checkCall(live, [live], entries, NOW, REST).busy).toEqual([]);
  });
});
