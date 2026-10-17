import type { Tournament } from '@/engine/types';

import type { Lookup } from '@/data/lookup';

/** The tournament the homepage welcomes people to: the live one, else the next one, else the latest. */
export function featuredTournament(lk: Lookup): Tournament | undefined {
  const ts = lk.tournaments;
  return (
    ts.find((t) => t.status === 'live') ??
    [...ts].filter((t) => t.status === 'registration' || t.status === 'closed').sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ??
    [...ts].filter((t) => t.status === 'completed').sort((a, b) => b.endDate.localeCompare(a.endDate))[0]
  );
}
