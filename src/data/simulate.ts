// Tournament simulation: make every draw, then play match day with plausible results.
// Pure functions on the data snapshot, so the organizer's simulator, the demo and tests share them.
import { bwfSeedCount, generateDraw, groupCount } from '@/engine/draws';
import { LEVEL_VALUE } from '@/engine/pairing';
import { gamesToWin, type ScoringRules } from '@/engine/rules';
import type { GameScore, ID, Side, TEvent } from '@/engine/types';

import { fillFreeCourts } from '@/data/assign';
import { entryClub } from '@/data/clubs';
import { applySeeds, publishPlan, resolveTournament, rulesOfMatch, saveResult } from '@/data/ops';
import type { DB } from '@/data/types';

/** Average level of an entry for its event (A=4 … D=1): levels given at entry, else the players' levels. */
export function entryLevel(db: DB, entryId: ID | null | undefined): number {
  const e = db.entries.find((x) => x.id === entryId);
  if (!e) return 2.5;
  const levels = e.levels ?? e.playerIds.map((p) => db.players.find((x) => x.id === p)?.level ?? 'C');
  const all = e.pendingPartner ? [...levels, e.pendingPartner.level] : levels;
  return all.reduce((s, l) => s + LEVEL_VALUE[l], 0) / Math.max(1, all.length);
}

/** Hidden playing strength for results: the demo's `strength` when present, else the level with some spread. */
function strengthOf(db: DB, entryId: ID | null): number {
  const e = db.entries.find((x) => x.id === entryId);
  if (!e) return 5;
  const vals = e.playerIds.map((p) => db.players.find((x) => x.id === p)?.strength);
  if (vals.every((v) => v !== undefined)) return (vals as number[]).reduce((a, b) => a + b, 0) / vals.length;
  return 1.5 + entryLevel(db, entryId) * 2;
}

/** Plausible game scores; the stronger side wins more often. */
export function simulateResult(r: ScoringRules, sa: number, sb: number, rand: () => number): { games: GameScore[]; winner: Side } {
  const pA = 1 / (1 + 10 ** ((sb - sa) / 4));
  const need = gamesToWin(r);
  const games: GameScore[] = [];
  let wa = 0;
  let wb = 0;
  while (wa < need && wb < need) {
    const aWins = rand() < pA + (rand() - 0.5) * 0.2;
    const P = r.pointsToWin;
    let w = P;
    let l: number;
    if (r.cap > P && rand() < 0.14) {
      const extra = Math.floor(rand() * Math.min(5, r.cap - P));
      w = P + 1 + extra;
      l = w - 2;
      if (w > r.cap) w = r.cap;
      if (w === r.cap) l = r.cap - 1 - Math.floor(rand() * 2);
    } else {
      l = Math.max(0, Math.round(P - 2 - rand() * rand() * (P - 4)));
    }
    games.push(aWins ? [w, l] : [l, w]);
    if (aWins) wa++;
    else wb++;
  }
  return { games, winner: wa > wb ? 'a' : 'b' };
}

/**
 * Make an event's draw the way an organizer would with the defaults: accepted entries ranked by
 * level, BWF seed count, level-balanced first round, clubmates apart.
 */
export function drawEvent(db: DB, eventId: ID, rngSeed: number): DB {
  const ev = db.events.find((e) => e.id === eventId);
  if (!ev) return db;
  const entries = db.entries
    .filter((e) => e.eventId === eventId && e.status === 'accepted')
    .sort((a, b) => entryLevel(db, b.id) - entryLevel(db, a.id) || a.createdAt - b.createdAt);
  if (entries.length < 2) return db;
  const n = entries.length;
  const seeds = ev.mode === 'round_robin' ? Math.min(n, groupCount(n, ev.config.groupSize)) : bwfSeedCount(n);
  const event: TEvent = { ...ev, config: { ...ev.config, seeds } };
  const clubOf = (id: ID) =>
    entryClub((db.entries.find((x) => x.id === id)?.playerIds ?? []).flatMap((p) => db.players.find((x) => x.id === p) ?? []));
  const plan = generateDraw({
    event,
    entryIds: entries.map((e) => e.id),
    seeds,
    rngSeed,
    clubOf,
    levelOf: (id) => entryLevel(db, id),
  });
  let next = { ...db, events: db.events.map((e) => (e.id === eventId ? event : e)) };
  next = applySeeds(
    publishPlan(next, eventId, plan, rngSeed),
    eventId,
    entries.map((e) => e.id),
  );
  return resolveTournament(next, ev.tournamentId);
}

/** Draw every event of a tournament that has no draw yet. */
export function drawAll(db: DB, tournamentId: ID, rngSeed: number): DB {
  return db.events
    .filter((e) => e.tournamentId === tournamentId && e.drawState !== 'published')
    .reduce((acc, e, i) => drawEvent(acc, e.id, rngSeed + i * 7919), db);
}

export interface TickResult {
  db: DB;
  finished: ID[];
  called: ID[];
}

/**
 * One step of match day at time `now`: the longest-running match on court finishes with a
 * simulated result, then free courts get the next ready matches (players free; resting players
 * wait unless nothing else can go on). Call notices go out like a real court call.
 */
export function simulateTick(db: DB, tournamentId: ID, now: number, rand: () => number, finishCount = 1): TickResult {
  const t = db.tournaments.find((x) => x.id === tournamentId);
  if (!t) return { db, finished: [], called: [] };
  const evIds = new Set(db.events.filter((e) => e.tournamentId === tournamentId).map((e) => e.id));
  const mine = () => db.matches.filter((m) => evIds.has(m.eventId));
  const finished: ID[] = [];
  const called: ID[] = [];

  // 1. finish the oldest matches on court
  const onCourt = mine()
    .filter((m) => m.status === 'on_court')
    .sort((a, b) => (a.calledAt ?? 0) - (b.calledAt ?? 0))
    .slice(0, finishCount);
  for (const m of onCourt) {
    const walkover = rand() < 0.01;
    const sim = simulateResult(rulesOfMatch(db, m), strengthOf(db, m.a), strengthOf(db, m.b), rand);
    // played for 18–45 minutes (back-dated, so durations look real even when the simulator runs fast)
    const dur = walkover ? 0 : Math.round((18 + rand() * 27) * 60_000);
    const started = {
      ...db,
      matches: db.matches.map((x) =>
        x.id === m.id ? { ...x, calledAt: now - dur - 3 * 60_000, startedAt: walkover ? undefined : now - dur } : x,
      ),
    };
    const r = saveResult(
      started,
      m.id,
      walkover ? { games: [], result: 'walkover', winner: sim.winner } : { games: sim.games, result: 'normal' },
      now,
    );
    if (r.db) {
      db = r.db;
      finished.push(m.id);
    }
  }

  // 2. fill free courts the way the desk's "Fill free courts" does (events take turns)
  const fill = (ignoreRest: boolean) => {
    const r = fillFreeCourts(db, tournamentId, now, { ignoreRest });
    db = r.db;
    called.push(...r.called.map((c) => c.matchId));
  };
  fill(false);
  // Simulated time runs faster than the rest clock, so keep the hall moving: if fewer than half the
  // courts are in use and only resting players are left, call them anyway (busy players never are).
  if (mine().filter((m) => m.status === 'on_court').length < Math.ceil(t.courts.length / 2)) fill(true);
  return { db, finished, called };
}

/** Play until `matches` more results are in (or nothing is left). Times advance `minutesPerMatch` per result. */
export function simulateMatches(
  db: DB,
  tournamentId: ID,
  matches: number,
  start: number,
  rand: () => number,
  minutesPerMatch = 4,
): TickResult {
  const finished: ID[] = [];
  const called: ID[] = [];
  let now = start;
  for (let guard = 0; guard < matches * 3 + 10 && finished.length < matches; guard++) {
    const r = simulateTick(db, tournamentId, now, rand);
    db = r.db;
    finished.push(...r.finished);
    called.push(...r.called);
    if (!r.finished.length && !r.called.length) break;
    now += minutesPerMatch * 60_000;
  }
  return { db, finished, called };
}

/** Progress of a tournament's match day. */
export function matchDayStats(db: DB, tournamentId: ID) {
  const evIds = new Set(db.events.filter((e) => e.tournamentId === tournamentId).map((e) => e.id));
  const ms = db.matches.filter((m) => evIds.has(m.eventId) && m.status !== 'bye');
  return {
    total: ms.length,
    finished: ms.filter((m) => m.status === 'finished').length,
    onCourt: ms.filter((m) => m.status === 'on_court').length,
    ready: ms.filter((m) => m.status === 'ready').length,
    pending: ms.filter((m) => m.status === 'pending').length,
  };
}
