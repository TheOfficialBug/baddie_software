// Derived, read-only views over the data used by several screens.
import { useMemo } from 'react';

import { readyQueue } from '@/engine/scheduler';
import { computeStandings } from '@/engine/standings';
import type { FlightLabel, Match, Player, TEvent, Tournament } from '@/engine/types';

import { checkInsOf } from '@/data/checkIns';
import type { Lookup } from '@/data/lookup';
import { useStore } from '@/data/store';

/** Matches waiting for a court, in call order, with busy/resting info. */
export function useQueue(lk: Lookup, t: Tournament | undefined, now: number) {
  const entries = useStore((s) => s.entries);
  return useMemo(() => {
    if (!t) return [];
    const map = new Map(entries.map((e) => [e.id, e]));
    return readyQueue(lk.matchesOf(t.id), map, (p) => lk.player(p)?.name ?? '', t.courts, now, t.restMinutes);
  }, [lk, t, entries, now]);
}

/** Who has checked in at the venue: player id → check-in. */
export function useCheckIns(tid: string | undefined) {
  const all = useStore((s) => s.checkIns);
  return useMemo(() => checkInsOf(all, tid ?? ''), [all, tid]);
}

/** Check-ins to show on players' names: from the time entries close (match day is near), otherwise none. */
export function useCheckInMarks(t: Tournament | undefined) {
  const checkIns = useCheckIns(t?.id);
  return t && (t.status === 'closed' || t.status === 'live') ? checkIns : undefined;
}

/** Everyone entered in a tournament (withdrawn entries excluded), sorted by name. */
export function tournamentPlayers(lk: Lookup, t: Tournament): Player[] {
  const ids = new Set(
    lk.eventsOf(t.id).flatMap((e) =>
      lk
        .entriesOf(e.id)
        .filter((x) => x.status !== 'withdrawn')
        .flatMap((x) => x.playerIds),
    ),
  );
  return [...ids]
    .map((id) => lk.player(id)!)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface Champion {
  label: string;
  name: string;
  f?: FlightLabel;
}

/** Winner of each knockout stage's final (per flight / plate / main), or a lone group's winner. */
export function champions(lk: Lookup, ev: TEvent): Champion[] {
  const out: Champion[] = [];
  for (const s of lk.stagesOf(ev.id)) {
    if (s.kind !== 'knockout' || s.placement) continue;
    const final = lk.matchesOfEvent(ev.id).find((m) => m.stageId === s.id && m.round === s.rounds);
    if (final?.status === 'finished' && final.winner) {
      out.push({
        label: s.flight ? `Flight ${s.flight}` : s.name === 'Main draw' || s.name === 'Knockout' ? 'Champion' : s.name,
        name: lk.entryName(final[final.winner]),
        f: s.flight,
      });
    }
  }
  if (!out.length && ev.mode === 'round_robin') {
    const gs = lk.stagesOf(ev.id).find((s) => s.kind === 'group');
    const ms = lk.matchesOfEvent(ev.id);
    const groups = gs ? lk.groupsOf(gs.id) : [];
    if (
      gs &&
      groups.length === 1 &&
      !lk.stagesOf(ev.id).some((s) => s.kind === 'knockout') &&
      ms.length &&
      ms.every((m) => m.status === 'finished')
    ) {
      const st = computeStandings(groups[0].id, groups[0].entryIds, ms, lk.groupRules(ev.id));
      out.push({ label: 'Champion', name: lk.entryName(st.rows[0]?.entryId) });
    }
  }
  return out;
}

/** Why a pending match can't be played yet (the matches or groups it depends on). */
export function waitingFor(lk: Lookup, m: Match) {
  const src = [m.srcA, m.srcB]
    .map((s) => (s.kind === 'winner' || s.kind === 'loser' ? lk.match(s.matchId) : undefined))
    .filter((x) => x && x.status !== 'finished' && x.status !== 'bye') as Match[];
  if (src.length) return `Waiting for ${src.map((x) => `#${x.number}`).join(' and ')} to finish`;
  if (m.srcA.kind === 'drop' || m.srcB.kind === 'drop') return 'Waiting for players to drop from the flight above';
  return 'Waiting for group results';
}
