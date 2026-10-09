import { beforeEach, describe, expect, it } from 'vitest';

import type { GameScore, Match, MatchUpdate, Side } from '@/engine/types';

import { buildDemo } from '@/data/demo';
import * as ops from '@/data/ops';
import type { DB } from '@/data/types';

const NOW = Date.UTC(2026, 9, 10, 15, 0);

let db: DB;
beforeEach(() => {
  db = buildDemo(NOW);
});

const live = () => db.tournaments.find((t) => t.status === 'live')!;
const matchesOfLive = () => {
  const evs = new Set(db.events.filter((e) => e.tournamentId === live().id).map((e) => e.id));
  return db.matches.filter((m) => evs.has(m.eventId));
};
const freeCourt = () => live().courts.find((c) => !db.matches.some((m) => m.status === 'on_court' && m.courtId === c.id))!;
const busyCourt = () => live().courts.find((c) => db.matches.some((m) => m.status === 'on_court' && m.courtId === c.id))!;
const get = (d: DB, id: string) => d.matches.find((m) => m.id === id)!;
const playersOf = (m: Match) => [m.a, m.b].flatMap((e) => db.entries.find((x) => x.id === e)?.playerIds ?? []);

/** A ready match whose players are not on court and not resting. */
function callableMatch(): Match {
  const m = matchesOfLive().find((x) => x.status === 'ready' && !ops.callToCourt(db, x.id, freeCourt().id, NOW).conflict);
  if (!m) throw new Error('demo has no callable match');
  return m;
}

/** A winning set of games for `side` under the match's rules. */
function winningGames(m: Match, side: Side): GameScore[] {
  const r = ops.rulesOfMatch(db, m);
  const game: GameScore = side === 'a' ? [r.pointsToWin, 10] : [10, r.pointsToWin];
  return Array.from({ length: Math.ceil(r.bestOf / 2) }, () => [...game] as GameScore);
}

describe('callToCourt', () => {
  it('puts a ready match on a free court and stamps the call time', () => {
    const m = callableMatch();
    const court = freeCourt();
    const r = ops.callToCourt(db, m.id, court.id, NOW);
    expect(r.error).toBeUndefined();
    expect(get(r.db!, m.id)).toMatchObject({ status: 'on_court', courtId: court.id, calledAt: NOW, live: null });
  });

  it('refuses a court that already has a match', () => {
    const r = ops.callToCourt(db, callableMatch().id, busyCourt().id, NOW);
    expect(r.error).toMatch(/That court has match #\d+/);
  });

  it('reports players who are on another court, unless the desk overrides', () => {
    const m = callableMatch();
    const onCourt = matchesOfLive().find((x) => x.status === 'on_court')!;
    db = { ...db, matches: db.matches.map((x) => (x.id === onCourt.id ? { ...x, a: m.a } : x)) };
    const r = ops.callToCourt(db, m.id, freeCourt().id, NOW);
    expect(r.db).toBeUndefined();
    expect(r.conflict?.busy.length).toBeGreaterThan(0);
    expect(ops.callToCourt(db, m.id, freeCourt().id, NOW, { busy: true }).db).toBeDefined();
  });

  it('reports players still resting, unless the desk overrides', () => {
    const m = callableMatch();
    const done = matchesOfLive().find((x) => x.status === 'finished' && x.result === 'normal')!;
    db = { ...db, matches: db.matches.map((x) => (x.id === done.id ? { ...x, a: m.a, finishedAt: NOW - 2 * 60_000 } : x)) };
    const r = ops.callToCourt(db, m.id, freeCourt().id, NOW);
    expect(r.conflict?.resting.length).toBeGreaterThan(0);
    expect(r.conflict?.resting[0].minutesLeft).toBeGreaterThan(0);
    expect(ops.callToCourt(db, m.id, freeCourt().id, NOW, { rest: true }).db).toBeDefined();
  });

  it('refuses matches that are not ready', () => {
    const pending = matchesOfLive().find((x) => x.status === 'pending')!;
    expect(ops.callToCourt(db, pending.id, freeCourt().id, NOW).error).toMatch(/not ready/);
  });
});

describe('results', () => {
  it('finishes a match, records the winner and moves them into the next match', () => {
    const m = matchesOfLive().find(
      (x) => x.status === 'on_court' && db.matches.some((n) => [n.srcA, n.srcB].some((s) => s.kind === 'winner' && s.matchId === x.id)),
    )!;
    const r = ops.saveResult(db, m.id, { games: winningGames(m, 'b'), result: 'normal' }, NOW);
    expect(r.error).toBeUndefined();
    const saved = get(r.db!, m.id);
    expect(saved).toMatchObject({ status: 'finished', winner: 'b', finishedAt: NOW });
    const next = r.db!.matches.find((n) => [n.srcA, n.srcB].some((s) => s.kind === 'winner' && s.matchId === m.id))!;
    const side = next.srcA.kind === 'winner' && next.srcA.matchId === m.id ? 'a' : 'b';
    expect(next[side]).toBe(m.b);
  });

  it('rejects impossible scores with a readable reason', () => {
    const m = matchesOfLive().find((x) => x.status === 'on_court')!;
    const r = ops.saveResult(db, m.id, { games: [[23, 20]], result: 'normal' }, NOW);
    expect(r.db).toBeUndefined();
    expect(r.error).toBeTruthy();
  });

  it('counts duration from the call when the clock was never started', () => {
    const m = matchesOfLive().find((x) => x.status === 'on_court')!;
    db = { ...db, matches: db.matches.map((x) => (x.id === m.id ? { ...x, startedAt: undefined, calledAt: NOW - 30 * 60_000 } : x)) };
    const r = ops.saveResult(db, m.id, { games: winningGames(m, 'a'), result: 'normal' }, NOW);
    expect(get(r.db!, m.id).startedAt).toBe(NOW - 30 * 60_000);
  });

  it('undo restores the snapshot taken before the change', () => {
    const m = matchesOfLive().find((x) => x.status === 'on_court')!;
    const u: MatchUpdate = { id: 'u1', matchId: m.id, at: NOW, label: 'Result saved', before: ops.snapshot(m) };
    const saved = ops.saveResult(db, m.id, { games: winningGames(m, 'a'), result: 'normal' }, NOW).db!;
    const undone = ops.restore(saved, u).db!;
    expect(get(undone, m.id)).toMatchObject({ status: 'on_court', courtId: m.courtId, winner: undefined });
  });

  it('returning to the queue frees the court and clears the clock', () => {
    const m = matchesOfLive().find((x) => x.status === 'on_court')!;
    expect(get(ops.returnToQueue(db, m.id), m.id)).toMatchObject({ status: 'ready', courtId: undefined, startedAt: undefined, games: [] });
  });
});

describe('live scoring', () => {
  it('adds points and rolls a finished game into the games list', () => {
    const m = matchesOfLive().find((x) => x.status === 'on_court')!;
    const rules = ops.rulesOfMatch(db, m);
    let cur: DB = { ...db, matches: db.matches.map((x) => (x.id === m.id ? { ...x, games: [], live: [rules.pointsToWin - 1, 0] } : x)) };
    cur = ops.adjustLive(cur, m.id, 'a', 1, rules, NOW).db!;
    expect(get(cur, m.id).games).toEqual([[rules.pointsToWin, 0]]);
    expect(get(cur, m.id).live).toEqual([0, 0]);
  });
});

describe('notices and seeds', () => {
  it('addresses a court call to every player in the match', () => {
    const m = callableMatch();
    const n = ops.courtCallNotice(db, m.id, freeCourt().id, NOW)!;
    expect(n.kind).toBe('call');
    expect(new Set(n.playerIds)).toEqual(new Set(playersOf(m)));
    expect(n.title).toContain(`#${m.number}`);
  });

  it('numbers seeds in order, up to the event seed count', () => {
    const ev = db.events.find((e) => e.config.seeds > 0)!;
    const ids = db.entries.filter((e) => e.eventId === ev.id).map((e) => e.id);
    const next = ops.applySeeds(db, ev.id, ids);
    const seeds = next.entries.filter((e) => e.eventId === ev.id).map((e) => e.seed);
    expect(seeds.slice(0, ev.config.seeds)).toEqual(Array.from({ length: ev.config.seeds }, (_, i) => i + 1));
    expect(seeds.slice(ev.config.seeds).every((s) => s === undefined)).toBe(true);
  });
});
