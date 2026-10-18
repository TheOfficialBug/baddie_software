import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { LEVEL_VALUE } from '@/engine/pairing';
import { groupRulesId, RULES, rulesIdForMatch, type ScoringRules } from '@/engine/rules';
import type { Entry, Group, ID, Match, Player, SkillLevel, Slot, Stage, TEvent, Tournament } from '@/engine/types';

import { useStore } from '@/data/store';
import type { DB } from '@/data/types';

export interface Lookup {
  tournaments: Tournament[];
  tournament: (id?: ID) => Tournament | undefined;
  bySlug: (slug?: string) => Tournament | undefined;
  player: (id?: ID) => Player | undefined;
  entry: (id?: Slot) => Entry | undefined;
  event: (id?: ID) => TEvent | undefined;
  stage: (id?: ID) => Stage | undefined;
  group: (id?: ID) => Group | undefined;
  match: (id?: ID) => Match | undefined;
  rules: (eventId: ID) => ScoringRules;
  /** scoring for a specific match (players' first match may differ) */
  matchRules: (m: Match) => ScoringRules;
  /** scoring used in an event's round-robin groups */
  groupRules: (eventId: ID) => ScoringRules;
  eventsOf: (tid: ID) => TEvent[];
  matchesOf: (tid: ID) => Match[];
  matchesOfEvent: (eid: ID) => Match[];
  stagesOf: (eid: ID) => Stage[];
  groupsOf: (stageId: ID) => Group[];
  entriesOf: (eid: ID) => Entry[];
  playersOfEntry: (id?: Slot) => Player[];
  /** "Aarav Rao" or "Aarav Rao / Ben Lin" */
  entryName: (id?: Slot) => string;
  entryClub: (id?: Slot) => string | undefined;
  /** Each player's level for this event (levels given at entry, else general level), named partner last. */
  entryLevels: (id?: Slot) => SkillLevel[];
  /** Average level of an entry (A=4 … D=1) for this event: levels given at entry, else each player's general level. */
  entryLevel: (id: ID) => number;
  entriesOfPlayer: (pid: ID, tid?: ID) => Entry[];
  courtName: (tid: ID, courtId?: ID) => string;
  /** The collections this lookup reads (to tell what changed between two lookups, see sameButMatches). */
  src: LookupSource;
}

type LookupSource = Pick<DB, 'tournaments' | 'players' | 'entries' | 'events' | 'stages' | 'groups' | 'matches'>;

/**
 * Two lookups read the same data except, perhaps, the matches. A component that shows one match (and no
 * other match through the lookup) can skip re-rendering on a live point elsewhere when this holds.
 */
export const sameButMatches = (a: Lookup, b: Lookup): boolean =>
  a === b ||
  (a.src.tournaments === b.src.tournaments &&
    a.src.players === b.src.players &&
    a.src.entries === b.src.entries &&
    a.src.events === b.src.events &&
    a.src.stages === b.src.stages &&
    a.src.groups === b.src.groups);

// Indexes are cached per collection array: the store replaces an array only when it changes, so a live point
// (a new matches array) rebuilds the match indexes and reuses those of players, entries and events.
// What a lookup returns is read-only: the same arrays are shared by every lookup until the data changes.
function cached<T, R>(build: (xs: T[]) => R): (xs: T[]) => R {
  const cache = new WeakMap<T[], R>();
  return (xs) => {
    let r = cache.get(xs);
    if (r === undefined) cache.set(xs, (r = build(xs)));
    return r;
  };
}
const indexById = <T extends { id: ID }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
function groupBy<T>(xs: T[], key: (x: T) => ID): Map<ID, T[]> {
  const out = new Map<ID, T[]>();
  for (const x of xs) {
    const list = out.get(key(x));
    if (list) list.push(x);
    else out.set(key(x), [x]);
  }
  return out;
}
const tournamentsById = cached((xs: Tournament[]) => indexById(xs));
const playersById = cached((xs: Player[]) => indexById(xs));
const entriesById = cached((xs: Entry[]) => indexById(xs));
const eventsById = cached((xs: TEvent[]) => indexById(xs));
const stagesById = cached((xs: Stage[]) => indexById(xs));
const groupsById = cached((xs: Group[]) => indexById(xs));
const matchesById = cached((xs: Match[]) => indexById(xs));
const eventsByTournament = cached((xs: TEvent[]) => groupBy(xs, (e) => e.tournamentId));
const matchesByEvent = cached((xs: Match[]) => groupBy(xs, (m) => m.eventId));
const entriesByEvent = cached((xs: Entry[]) => groupBy(xs, (e) => e.eventId));

export function makeLookup(s: LookupSource): Lookup {
  const T = tournamentsById(s.tournaments);
  const P = playersById(s.players);
  const E = entriesById(s.entries);
  const EV = eventsById(s.events);
  const ST = stagesById(s.stages);
  const G = groupsById(s.groups);
  const M = matchesById(s.matches);
  const eventsByT = eventsByTournament(s.events);
  const matchesByE = matchesByEvent(s.matches);
  const entriesByE = entriesByEvent(s.entries);

  const playersOfEntry = (id?: Slot) => {
    if (!id || id === 'BYE') return [];
    return (E.get(id)?.playerIds ?? []).map((p) => P.get(p)).filter(Boolean) as Player[];
  };
  const lk: Lookup = {
    tournaments: s.tournaments,
    tournament: (id) => (id ? T.get(id) : undefined),
    bySlug: (slug) => s.tournaments.find((t) => t.slug === slug || t.id === slug),
    player: (id) => (id ? P.get(id) : undefined),
    entry: (id) => (id && id !== 'BYE' ? E.get(id) : undefined),
    event: (id) => (id ? EV.get(id) : undefined),
    stage: (id) => (id ? ST.get(id) : undefined),
    group: (id) => (id ? G.get(id) : undefined),
    match: (id) => (id ? M.get(id) : undefined),
    rules: (eventId) => RULES[EV.get(eventId)?.rules ?? 'BWF_3x21'],
    matchRules: (m) => {
      const ev = EV.get(m.eventId);
      return ev ? RULES[rulesIdForMatch(ev, ST.get(m.stageId), m, (id) => M.get(id))] : RULES.BWF_3x21;
    },
    groupRules: (eventId) => {
      const ev = EV.get(eventId);
      return RULES[ev ? groupRulesId(ev) : 'BWF_3x21'];
    },
    eventsOf: (tid) => eventsByT.get(tid) ?? [],
    matchesOf: (tid) => (eventsByT.get(tid) ?? []).flatMap((e) => matchesByE.get(e.id) ?? []),
    matchesOfEvent: (eid) => matchesByE.get(eid) ?? [],
    stagesOf: (eid) => s.stages.filter((x) => x.eventId === eid).sort((a, b) => a.order - b.order),
    groupsOf: (stageId) => s.groups.filter((g) => g.stageId === stageId),
    entriesOf: (eid) => entriesByE.get(eid) ?? [],
    playersOfEntry,
    entryName: (id) => {
      if (id === 'BYE') return 'Bye';
      const names = playersOfEntry(id).map((p) => p.name);
      const pending = id ? E.get(id)?.pendingPartner : undefined;
      if (pending) names.push(pending.name);
      return names.length ? names.join(' / ') : 'TBD';
    },
    entryClub: (id) => {
      const clubs = [...new Set(playersOfEntry(id).map((p) => p.club))];
      return clubs.length ? clubs.join(' · ') : undefined;
    },
    entryLevels: (id) => {
      const e = id && id !== 'BYE' ? E.get(id) : undefined;
      if (!e) return [];
      const levels = e.playerIds.map((p, i) => e.levels?.[i] ?? P.get(p)?.level ?? 'C');
      return e.pendingPartner ? [...levels, e.pendingPartner.level] : levels;
    },
    entryLevel: (id) => {
      const e = E.get(id);
      if (!e) return 0;
      const levels = e.levels ?? e.playerIds.map((p) => P.get(p)?.level ?? 'C');
      const all = e.pendingPartner ? [...levels, e.pendingPartner.level] : levels;
      return all.reduce((sum, l) => sum + LEVEL_VALUE[l], 0) / Math.max(1, all.length);
    },
    entriesOfPlayer: (pid, tid) =>
      s.entries.filter((e) => e.playerIds.includes(pid) && e.status !== 'withdrawn' && (!tid || EV.get(e.eventId)?.tournamentId === tid)),
    courtName: (tid, courtId) => T.get(tid)?.courts.find((c) => c.id === courtId)?.name ?? 'Court',
    src: s,
  };
  return lk;
}

/** Indexed, memoised read access to the store. Re-computes only when the underlying collections change. */
export function useLookup(): Lookup {
  const src = useStore(
    useShallow((s) => ({
      tournaments: s.tournaments,
      players: s.players,
      entries: s.entries,
      events: s.events,
      stages: s.stages,
      groups: s.groups,
      matches: s.matches,
    })),
  );
  return useMemo(() => sharedLookup(src), [src]);
}

/** Components reading the same data share one lookup (a page and its tabs, the desk's panels). */
let last: { src: LookupSource; lk: Lookup } | null = null;
function sharedLookup(src: LookupSource): Lookup {
  const prev = last;
  if (prev && (Object.keys(src) as (keyof LookupSource)[]).every((k) => prev.src[k] === src[k])) return prev.lk;
  last = { src, lk: makeLookup(src) };
  return last.lk;
}
