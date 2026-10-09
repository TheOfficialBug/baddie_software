import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { LEVEL_VALUE } from '@/engine/pairing';
import { groupRulesId, RULES, rulesIdForMatch, type ScoringRules } from '@/engine/rules';
import type { Entry, Group, ID, Match, Player, Slot, Stage, TEvent, Tournament } from '@/engine/types';

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
  /** scoring for a specific match (opening round may differ) */
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
  /** Average level of an entry (A=4 … D=1) for this event: levels given at entry, else each player's general level. */
  entryLevel: (id: ID) => number;
  entriesOfPlayer: (pid: ID, tid?: ID) => Entry[];
  courtName: (tid: ID, courtId?: ID) => string;
}

type LookupSource = Pick<DB, 'tournaments' | 'players' | 'entries' | 'events' | 'stages' | 'groups' | 'matches'>;

export function makeLookup(s: LookupSource): Lookup {
  const map = <T extends { id: ID }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const T = map(s.tournaments);
  const P = map(s.players);
  const E = map(s.entries);
  const EV = map(s.events);
  const ST = map(s.stages);
  const G = map(s.groups);
  const M = map(s.matches);
  const eventsByT = new Map<ID, TEvent[]>();
  s.events.forEach((e) => eventsByT.set(e.tournamentId, [...(eventsByT.get(e.tournamentId) ?? []), e]));
  const matchesByE = new Map<ID, Match[]>();
  s.matches.forEach((m) => matchesByE.set(m.eventId, [...(matchesByE.get(m.eventId) ?? []), m]));
  const entriesByE = new Map<ID, Entry[]>();
  s.entries.forEach((e) => entriesByE.set(e.eventId, [...(entriesByE.get(e.eventId) ?? []), e]));

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
      return ev ? RULES[rulesIdForMatch(ev, ST.get(m.stageId), m.round)] : RULES.BWF_3x21;
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
  return useMemo(() => makeLookup(src), [src]);
}
