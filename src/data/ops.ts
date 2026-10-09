// Pure operations on the database snapshot. The zustand store and the demo seeder both use these.
import { assignNumbers, blockingDependents, resolveMatches } from '@/engine/progression';
import { checkGame, checkMatch, groupRulesId, RULES, rulesIdForMatch, type ScoringRules } from '@/engine/rules';
import { checkCall } from '@/engine/scheduler';
import type { DrawPlan, GameScore, ID, Match, MatchUpdate, ResultType, Side, SkillLevel, TEvent, Tournament } from '@/engine/types';

import type { DB, Notice } from '@/data/types';

let counter = 0;
export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function rulesOf(db: DB, eventId: ID): ScoringRules {
  const ev = db.events.find((e) => e.id === eventId);
  return RULES[ev?.rules ?? 'BWF_3x21'];
}

/** Scoring for one match (opening round may differ from the rest). */
export function rulesOfMatch(db: DB, m: Match): ScoringRules {
  const ev = db.events.find((e) => e.id === m.eventId);
  if (!ev) return RULES.BWF_3x21;
  return RULES[
    rulesIdForMatch(
      ev,
      db.stages.find((s) => s.id === m.stageId),
      m.round,
    )
  ];
}

const groupRulesOf = (db: DB, eventId: ID): ScoringRules => {
  const ev = db.events.find((e) => e.id === eventId);
  return RULES[ev ? groupRulesId(ev) : 'BWF_3x21'];
};

export function tournamentOfEvent(db: DB, eventId: ID): Tournament | undefined {
  const ev = db.events.find((e) => e.id === eventId);
  return db.tournaments.find((t) => t.id === ev?.tournamentId);
}

/** Re-resolve every match of one tournament (who plays whom, byes, progressions). */
export function resolveTournament(db: DB, tournamentId: ID): DB {
  const eventIds = new Set(db.events.filter((e) => e.tournamentId === tournamentId).map((e) => e.id));
  const mine = db.matches.filter((m) => eventIds.has(m.eventId));
  const resolved = resolveMatches(mine, {
    groups: db.groups.filter((g) => eventIds.has(g.eventId)),
    rulesFor: (id) => groupRulesOf(db, id),
  });
  const byId = new Map(resolved.map((m) => [m.id, m]));
  return { ...db, matches: db.matches.map((m) => byId.get(m.id) ?? m) };
}

export function publishPlan(db: DB, eventId: ID, plan: DrawPlan, rngSeed: number): DB {
  const ev = db.events.find((e) => e.id === eventId)!;
  const t = db.tournaments.find((x) => x.id === ev.tournamentId)!;
  const resolved = resolveMatches(plan.matches, { groups: plan.groups, rulesFor: () => RULES[groupRulesId(ev)] });
  const { matches, next } = assignNumbers(resolved, plan.stages, plan.groups, t.nextMatchNumber);
  return {
    ...db,
    tournaments: db.tournaments.map((x) => (x.id === t.id ? { ...x, nextMatchNumber: next } : x)),
    events: db.events.map((e) => (e.id === eventId ? { ...e, drawState: 'published', drawSeed: rngSeed } : e)),
    stages: [...db.stages.filter((s) => s.eventId !== eventId), ...plan.stages],
    groups: [...db.groups.filter((g) => g.eventId !== eventId), ...plan.groups],
    matches: [...db.matches.filter((m) => m.eventId !== eventId), ...matches],
    drawDrafts: db.drawDrafts.filter((d) => d.eventId !== eventId),
  };
}

/**
 * Correct a level given for an event (a mistake at registration). `slot` is the player's place in
 * the entry; the slot after the last player is the partner named at registration but not signed up.
 * Only this entry changes: the player's level in their other events stays as entered.
 */
export function setEntryLevel(db: DB, entryId: ID, slot: number, level: SkillLevel): DB {
  return {
    ...db,
    entries: db.entries.map((e) => {
      if (e.id !== entryId) return e;
      if (slot === e.playerIds.length) return e.pendingPartner ? { ...e, pendingPartner: { ...e.pendingPartner, level } } : e;
      if (slot < 0 || slot > e.playerIds.length) return e;
      const levels = e.levels ?? e.playerIds.map((p) => db.players.find((x) => x.id === p)?.level ?? 'C');
      return { ...e, levels: levels.map((l, i) => (i === slot ? level : l)) };
    }),
  };
}

/** Store seed numbers (1..n) for the first entries of seedOrder, up to the event's seed count. */
export function applySeeds(db: DB, eventId: ID, seedOrder: ID[]): DB {
  const ev = db.events.find((e) => e.id === eventId);
  if (!ev) return db;
  const seedOf = (id: ID) => {
    const i = seedOrder.indexOf(id);
    return i >= 0 && i < ev.config.seeds ? i + 1 : undefined;
  };
  return { ...db, entries: db.entries.map((e) => (e.eventId === eventId ? { ...e, seed: seedOf(e.id) } : e)) };
}

/** Notice to an event's players that its draw is published. */
export function drawPublishedNotice(ev: TEvent, now: number): Notice {
  return {
    id: uid('n'),
    tournamentId: ev.tournamentId,
    at: now,
    kind: 'draw',
    audience: 'event',
    eventId: ev.id,
    channels: ['app', 'email'],
    title: `${ev.name} draw is out`,
    body: 'See who you play and when on the Draws page.',
  };
}

/** Notice to an event's players that the organizer changed who starts where. */
export function drawUpdatedNotice(ev: TEvent, now: number): Notice {
  return {
    ...drawPublishedNotice(ev, now),
    title: `${ev.name} draw updated`,
    body: 'Some starting places changed. Check who you play next on the Draws page.',
  };
}

/** Notice to a match's players that they are called to a court. */
export function courtCallNotice(db: DB, matchId: ID, courtId: ID, now: number): Notice | null {
  const m = db.matches.find((x) => x.id === matchId);
  const ev = m && db.events.find((e) => e.id === m.eventId);
  const t = ev && db.tournaments.find((x) => x.id === ev.tournamentId);
  if (!m || !ev || !t) return null;
  const court = t.courts.find((c) => c.id === courtId)?.name ?? 'court';
  const playerIds = [m.a, m.b].flatMap((e) => db.entries.find((x) => x.id === e)?.playerIds ?? []);
  return {
    id: uid('n'),
    tournamentId: t.id,
    at: now,
    kind: 'call',
    audience: 'players',
    playerIds,
    eventId: ev.id,
    channels: ['app', 'sms'],
    title: `Match #${m.number} called to ${court}`,
    body: `${ev.name}. Please head to ${court} now.`,
  };
}

export function clearDraw(db: DB, eventId: ID): DB {
  return {
    ...db,
    events: db.events.map((e) => (e.id === eventId ? { ...e, drawState: 'none' } : e)),
    stages: db.stages.filter((s) => s.eventId !== eventId),
    groups: db.groups.filter((g) => g.eventId !== eventId),
    matches: db.matches.filter((m) => m.eventId !== eventId),
    // saved, unpublished edits of a removed draw no longer apply
    drawDrafts: db.drawDrafts.filter((d) => d.eventId !== eventId),
  };
}

const patchMatch = (db: DB, id: ID, patch: Partial<Match>): DB => ({
  ...db,
  matches: db.matches.map((m) => (m.id === id ? { ...m, ...patch } : m)),
});

export type OpResult = { db: DB; error?: undefined } | { db?: undefined; error: string };

/** Checks the desk chose to skip when calling a match anyway. */
export interface CallOverride {
  busy?: boolean;
  rest?: boolean;
}

export interface CallConflict {
  busy: { playerId: ID; match: Match }[];
  resting: { playerId: ID; minutesLeft: number }[];
}

/**
 * Send a match to a court. Refuses (with the reason) when a player is on another court or
 * still resting, unless `force` is set (the desk decided to go ahead anyway).
 */
export function callToCourt(
  db: DB,
  matchId: ID,
  courtId: ID,
  now: number,
  force: CallOverride = {},
): OpResult & { conflict?: CallConflict } {
  const m = db.matches.find((x) => x.id === matchId);
  if (!m) return { error: 'Match not found.' };
  if (m.status !== 'ready' && m.status !== 'on_court') return { error: 'This match is not ready to play yet.' };
  const busy = db.matches.find((x) => x.status === 'on_court' && x.courtId === courtId && x.id !== matchId);
  if (busy) return { error: `That court has match #${busy.number} on it.` };
  if (m.status === 'ready') {
    const t = tournamentOfEvent(db, m.eventId)!;
    const eventIds = new Set(db.events.filter((e) => e.tournamentId === t.id).map((e) => e.id));
    const check = checkCall(
      m,
      db.matches.filter((x) => eventIds.has(x.eventId)),
      new Map(db.entries.map((e) => [e.id, e])),
      now,
      t.restMinutes,
    );
    if ((check.busy.length && !force.busy) || (check.resting.length && !force.rest)) {
      return {
        error: check.busy.length ? 'A player is on another court.' : 'A player still needs rest.',
        conflict: { busy: force.busy ? [] : check.busy, resting: force.rest ? [] : check.resting },
      };
    }
  }
  const moving = m.status === 'on_court';
  return {
    db: patchMatch(db, matchId, { status: 'on_court', courtId, calledAt: moving ? m.calledAt : now, live: moving ? m.live : null }),
  };
}

export function returnToQueue(db: DB, matchId: ID): DB {
  return patchMatch(db, matchId, { status: 'ready', courtId: undefined, calledAt: undefined, startedAt: undefined, live: null, games: [] });
}

/** Live update: +1 / -1 for a side in the current game. Completed games roll into `games`. */
export function adjustLive(db: DB, matchId: ID, side: Side, delta: 1 | -1, rules: ScoringRules, now = Date.now()): OpResult {
  const m = db.matches.find((x) => x.id === matchId);
  if (!m || m.status !== 'on_court') return { error: 'Only matches on court can be updated live.' };
  const decided = matchDecided(m.games, rules);
  let live: GameScore = m.live ? [...m.live] : [0, 0];
  let games = m.games.slice();
  if (delta < 0 && live[0] === 0 && live[1] === 0 && games.length) {
    // step back into the previous game
    live = games.pop()!;
  } else if (decided && delta > 0) {
    return { error: 'The match is decided. Confirm the result.' };
  }
  const i = side === 'a' ? 0 : 1;
  live[i] = Math.max(0, live[i] + delta);
  const c = checkGame(live, rules);
  if (!c.valid) return { error: c.message ?? 'That score is not possible.' };
  if (c.complete) {
    games = [...games, live];
    live = [0, 0];
  }
  return { db: patchMatch(db, matchId, { games, live, startedAt: m.startedAt ?? now }) };
}

/**
 * Live update typed in directly: set one side's points in the current game. A finished game
 * (e.g. 21-17) rolls into `games` and the next game starts at 0-0, the same as with +1.
 */
export function setLivePoints(db: DB, matchId: ID, side: Side, points: number, rules: ScoringRules, now = Date.now()): OpResult {
  const m = db.matches.find((x) => x.id === matchId);
  if (!m || m.status !== 'on_court') return { error: 'Only matches on court can be updated live.' };
  if (!Number.isInteger(points) || points < 0 || points > rules.cap) return { error: `Enter a score from 0 to ${rules.cap}.` };
  if (matchDecided(m.games, rules)) return { error: 'The match is decided. Confirm the result.' };
  const live: GameScore = m.live ? [...m.live] : [0, 0];
  live[side === 'a' ? 0 : 1] = points;
  const c = checkGame(live, rules);
  if (!c.valid) return { error: c.message ?? `${live[0]}-${live[1]} is not a possible score.` };
  const games = c.complete ? [...m.games, live] : m.games;
  return { db: patchMatch(db, matchId, { games, live: c.complete ? [0, 0] : live, startedAt: m.startedAt ?? now }) };
}

export function matchDecided(games: GameScore[], rules: ScoringRules): boolean {
  return checkMatch(games, rules, 'normal').ok;
}

export interface ResultInput {
  games: GameScore[];
  result: ResultType;
  winner?: Side; // required for walkover / dq / retired (the side that did NOT retire)
}

export function saveResult(db: DB, matchId: ID, input: ResultInput, now: number): OpResult {
  const m = db.matches.find((x) => x.id === matchId);
  if (!m) return { error: 'Match not found.' };
  if (!m.a || !m.b || m.a === 'BYE' || m.b === 'BYE') return { error: 'Both players must be known before a result can be saved.' };
  const rules = rulesOfMatch(db, m);
  const check = checkMatch(input.games, rules, input.result, input.winner);
  if (!check.ok) return { error: check.errors[0] ?? 'Check the scores.' };
  if (m.status === 'finished') {
    const blocking = blockingDependents(matchId, db.matches).filter((d) => d.a !== null);
    const sameWinner = m.winner === check.winner;
    if (!sameWinner && blocking.length) {
      return {
        error: `Can't change the winner: match${blocking.length > 1 ? 'es' : ''} ${blocking.map((b) => `#${b.number}`).join(', ')} already started using this result.`,
      };
    }
  }
  const t = tournamentOfEvent(db, m.eventId)!;
  const next = patchMatch(db, matchId, {
    status: 'finished',
    games: input.games,
    result: input.result,
    winner: check.winner,
    live: null,
    finishedAt: m.status === 'finished' ? m.finishedAt : now,
    // a match entered without ever being "started" counts from when it was called
    startedAt: m.startedAt ?? (m.status === 'on_court' ? m.calledAt : undefined),
  });
  return { db: resolveTournament(next, t.id) };
}

/** Restore a match to an earlier snapshot (undo). Refuses if later matches already depend on it. */
export function restore(db: DB, u: MatchUpdate): OpResult {
  const m = db.matches.find((x) => x.id === u.matchId);
  if (!m) return { error: 'Match not found.' };
  if (m.status === 'finished' && u.before.status !== 'finished') {
    const blocking = blockingDependents(m.id, db.matches);
    if (blocking.length) return { error: `Can't undo: match #${blocking[0].number} has already started.` };
  }
  const t = tournamentOfEvent(db, m.eventId)!;
  return { db: resolveTournament(patchMatch(db, m.id, { ...u.before }), t.id) };
}

export const snapshot = (m: Match): MatchUpdate['before'] => ({
  status: m.status,
  games: m.games,
  live: m.live,
  result: m.result,
  winner: m.winner,
  courtId: m.courtId,
  finishedAt: m.finishedAt,
  calledAt: m.calledAt,
  startedAt: m.startedAt,
});
