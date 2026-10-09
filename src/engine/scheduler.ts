// "Ready to call" queue: which matches can go on court next, with rest and clash checks.
import type { Court, Entry, ID, Match } from './types';

export interface QueueItem {
  match: Match;
  /** a player is on court in another match right now */
  blocked?: string;
  /** a player hasn't had the minimum rest yet */
  resting?: { name: string; minutesLeft: number };
}

export function readyQueue(
  matches: Match[],
  entries: Map<ID, Entry>,
  playerName: (id: ID) => string,
  courts: Court[],
  now: number,
  restMinutes: number,
): QueueItem[] {
  const playersOf = (m: Match): ID[] => [m.a, m.b].flatMap((e) => (e && e !== 'BYE' ? (entries.get(e)?.playerIds ?? []) : []));

  const onCourt = new Map<ID, Match>();
  const lastFinished = new Map<ID, number>();
  for (const m of matches) {
    if (m.status === 'on_court') playersOf(m).forEach((p) => onCourt.set(p, m));
    if (m.status === 'finished' && m.finishedAt && m.result !== 'walkover') {
      playersOf(m).forEach((p) => lastFinished.set(p, Math.max(lastFinished.get(p) ?? 0, m.finishedAt!)));
    }
  }
  const courtName = (id?: ID) => courts.find((c) => c.id === id)?.name ?? 'court';

  const items: QueueItem[] = matches
    .filter((m) => m.status === 'ready')
    .map((m) => {
      const item: QueueItem = { match: m };
      for (const p of playersOf(m)) {
        const busy = onCourt.get(p);
        if (busy) {
          item.blocked = `${playerName(p)} is on ${courtName(busy.courtId)}`;
          break;
        }
        const last = lastFinished.get(p);
        if (last) {
          const left = Math.ceil(restMinutes - (now - last) / 60000);
          if (left > 0 && (!item.resting || left > item.resting.minutesLeft)) item.resting = { name: playerName(p), minutesLeft: left };
        }
      }
      return item;
    });

  const score = (q: QueueItem) => (q.blocked ? 2 : q.resting ? 1 : 0);
  return items.sort((x, y) => score(x) - score(y) || x.match.number - y.match.number);
}

export type PlayerState = 'on_court' | 'resting' | 'ready' | 'waiting' | 'done';

export interface PlayerStatus {
  playerId: ID;
  state: PlayerState;
  /** the match that defines the state (on court / next / waiting for) */
  match?: Match;
  /** on court: when they were called (or started) */
  since?: number;
  /** resting: minutes of rest left */
  restLeft?: number;
  lastFinishedAt?: number;
  played: number;
}

/**
 * Where every player is right now. Used by the live players board and to stop the desk
 * from calling someone who is already on another court.
 */
export function playerStatuses(matches: Match[], entries: Map<ID, Entry>, now: number, restMinutes: number): Map<ID, PlayerStatus> {
  const out = new Map<ID, PlayerStatus>();
  const get = (p: ID) => {
    let s = out.get(p);
    if (!s) out.set(p, (s = { playerId: p, state: 'done', played: 0 }));
    return s;
  };
  const playersOf = (m: Match) => [m.a, m.b].flatMap((e) => (e && e !== 'BYE' ? (entries.get(e)?.playerIds ?? []) : []));
  for (const e of entries.values()) if (e.status === 'accepted') e.playerIds.forEach(get);

  const rank: Record<PlayerState, number> = { on_court: 5, resting: 4, ready: 3, waiting: 2, done: 1 };
  for (const m of matches) {
    for (const p of playersOf(m)) {
      const s = get(p);
      // a walkover is not a match played: it neither counts nor starts a rest period (same as readyQueue)
      if (m.status === 'finished' && m.result !== 'walkover') {
        s.played++;
        if (m.finishedAt) s.lastFinishedAt = Math.max(s.lastFinishedAt ?? 0, m.finishedAt);
      }
    }
  }
  const set = (p: ID, next: Omit<PlayerStatus, 'playerId' | 'played' | 'lastFinishedAt'>) => {
    const s = get(p);
    if (
      rank[next.state] > rank[s.state] ||
      (rank[next.state] === rank[s.state] && next.match && s.match && next.match.number < s.match.number)
    ) {
      Object.assign(s, next);
    }
  };
  for (const m of matches) {
    if (m.status === 'on_court') playersOf(m).forEach((p) => set(p, { state: 'on_court', match: m, since: m.startedAt ?? m.calledAt }));
    else if (m.status === 'ready') {
      playersOf(m).forEach((p) => {
        const last = get(p).lastFinishedAt;
        const left = last ? Math.ceil(restMinutes - (now - last) / 60000) : 0;
        set(p, left > 0 ? { state: 'resting', match: m, restLeft: left } : { state: 'ready', match: m });
      });
    } else if (m.status === 'pending') playersOf(m).forEach((p) => set(p, { state: 'waiting', match: m }));
  }
  return out;
}

export interface CallCheck {
  /** players on another court right now: calling would double-book them */
  busy: { playerId: ID; match: Match }[];
  /** players who haven't had their minimum rest */
  resting: { playerId: ID; minutesLeft: number }[];
}

/** Can this match go on court now? */
export function checkCall(match: Match, matches: Match[], entries: Map<ID, Entry>, now: number, restMinutes: number): CallCheck {
  const st = playerStatuses(matches, entries, now, restMinutes);
  const ids = [match.a, match.b].flatMap((e) => (e && e !== 'BYE' ? (entries.get(e)?.playerIds ?? []) : []));
  const busy: CallCheck['busy'] = [];
  const resting: CallCheck['resting'] = [];
  for (const p of ids) {
    const s = st.get(p);
    if (s?.state === 'on_court' && s.match && s.match.id !== match.id) busy.push({ playerId: p, match: s.match });
    const last = s?.lastFinishedAt;
    const left = last ? Math.ceil(restMinutes - (now - last) / 60000) : 0;
    if (left > 0) resting.push({ playerId: p, minutesLeft: left });
  }
  return { busy, resting };
}
