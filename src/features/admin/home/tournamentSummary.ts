// At-a-glance numbers for a tournament card.
import type { Tournament } from '@/engine/types';

import { type Lookup } from '@/data/lookup';

export function summary(lk: Lookup, t: Tournament) {
  const events = lk.eventsOf(t.id);
  const all = events.flatMap((e) => lk.entriesOf(e.id));
  const entries = all.filter((x) => x.status !== 'withdrawn').length;
  const pending = all.filter((x) => x.status === 'pending').length;
  const published = events.filter((e) => e.drawState === 'published').length;
  const ms = lk.matchesOf(t.id).filter((m) => m.status !== 'bye' && m.number > 0);
  const onCourt = ms.filter((m) => m.status === 'on_court').length;
  const played = ms.filter((m) => m.status === 'finished').length;
  return { events, entries, pending, published, matches: ms.length, onCourt, played };
}
