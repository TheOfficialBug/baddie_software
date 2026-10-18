// Text and score helpers shared by match rows, cards and slips.
import { roundName } from '@/engine/draws';
import type { Match, Side, Slot } from '@/engine/types';

import type { Lookup } from '@/data/lookup';

export function matchContext(lk: Lookup, m: Match) {
  const ev = lk.event(m.eventId)!;
  const st = lk.stage(m.stageId)!;
  const group = lk.group(m.groupId);
  const round = group ? group.name : roundName(st, m.round);
  const short = group ? group.name.replace('Group ', 'Grp ') : roundName(st, m.round, true);
  const stageLabel = st.flight
    ? `${st.flight} flight`
    : st.kind === 'group'
      ? ''
      : st.name === 'Main draw' || st.name === 'Knockout'
        ? ''
        : st.name;
  return { ev, st, group, round, short, stageLabel, flight: st.flight, label: [stageLabel, round].filter(Boolean).join(' · ') };
}

/** Text for a slot whose player isn't known yet, e.g. "Winner of #12". */
export function slotPlaceholder(lk: Lookup, m: Match, side: Side): string {
  const src = side === 'a' ? m.srcA : m.srcB;
  if (src.kind === 'winner' || src.kind === 'loser') {
    const from = lk.match(src.matchId);
    if (from?.number) return `${src.kind === 'winner' ? 'Winner' : 'Loser'} of #${from.number}`;
    // the winner of a bye "match" is whoever is on its real side: describe that side instead
    if (from && src.kind === 'winner') {
      const realSide: Side | null = from.srcB.kind === 'bye' ? 'a' : from.srcA.kind === 'bye' ? 'b' : null;
      if (realSide) return sideName(lk, from, realSide);
    }
    return 'To be decided';
  }
  if (src.kind === 'drop') {
    // tournamentsoftware plates: whoever from that first-round match loses their 1st (or 2nd) match
    const from = lk.match(src.matchId);
    const who = from ? [from.a, from.b].filter((x): x is string => !!x && x !== 'BYE') : [];
    if (src.nth === 1 && from?.number && who.length === 2) return `Loser of #${from.number}`;
    if (who.length === 1) return `${lk.entryName(who[0])}, if knocked out`;
    return src.nth === 1 ? 'First-match loser' : 'Second-match loser';
  }
  if (src.kind === 'group') return `${lk.group(src.groupId)?.name ?? 'Group'} ${src.rank === 1 ? 'winner' : 'runner-up'}`;
  if (src.kind === 'bye') return 'Bye';
  return 'To be decided';
}

export function sideName(lk: Lookup, m: Match, side: Side) {
  const slot: Slot = m[side];
  return slot === 'BYE' ? 'Bye' : slot ? lk.entryName(slot) : slotPlaceholder(lk, m, side);
}

export function gamesFor(m: Match, side: Side, withLive = true): number[] {
  const i = side === 'a' ? 0 : 1;
  const xs = m.games.map((g) => g[i]);
  if (withLive && m.status === 'on_court' && m.live && (m.live[0] || m.live[1] || m.games.length)) xs.push(m.live[i]);
  return xs;
}
