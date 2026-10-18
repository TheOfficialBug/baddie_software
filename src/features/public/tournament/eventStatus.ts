import type { Match, TEvent } from '@/engine/types';

import type { Lookup } from '@/data/lookup';

import { matchContext } from '@/components/match/matchInfo';

/** Where a player stands in one event: "Dropped to C flight · next: C quarter-final". */
export function eventStatus(lk: Lookup, ev: TEvent, playerId: string): { text: string; next?: Match; flight?: 'A' | 'B' | 'C' | 'D' } {
  const mine = lk
    .matchesOfEvent(ev.id)
    .filter((m) => m.status !== 'bye' && [m.a, m.b].some((e) => lk.entry(e)?.playerIds.includes(playerId)))
    .sort((a, b) => a.number - b.number);
  const open = mine.find((m) => m.status === 'on_court' || m.status === 'ready');
  const last = [...mine].reverse().find((m) => m.status === 'finished');
  const pending = lk
    .matchesOfEvent(ev.id)
    .some(
      (m) =>
        m.status === 'pending' &&
        [m.srcA, m.srcB].some(
          (s) =>
            ((s.kind === 'winner' || s.kind === 'loser') && mine.some((x) => x.id === s.matchId && x.status === 'finished')) ||
            s.kind === 'drop',
        ),
    );
  const cur = open ?? last;
  const flight = cur ? lk.stage(cur.stageId)?.flight : undefined;
  if (!lk.stagesOf(ev.id).length) return { text: 'Draw not published yet' };
  if (open)
    return {
      text:
        open.status === 'on_court' ? `On ${lk.courtName(ev.tournamentId, open.courtId)} now` : `Up next: ${matchContext(lk, open).label}`,
      next: open,
      flight,
    };
  if (pending) return { text: 'Waiting for the next opponent', flight };
  if (!last) return { text: 'Waiting for the first match' };
  const iWon = last.winner && lk.entry(last[last.winner])?.playerIds.includes(playerId);
  const st = lk.stage(last.stageId)!;
  if (iWon && last.round === st.rounds && st.kind === 'knockout')
    return { text: `Won the ${st.flight ? `${st.flight} flight` : st.name === 'Main draw' ? 'event' : st.name}`, flight };
  return { text: last.loserTo && !iWon ? `Dropped to the ${last.loserTo}` : 'Finished', flight };
}
