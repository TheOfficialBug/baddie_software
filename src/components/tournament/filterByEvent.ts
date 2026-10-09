import type { ID, Match } from '@/engine/types';

/** "all" or an event id. */
export type EventFilterValue = 'all' | ID;

/** Matches of the chosen event (or all of them). */
export const byEvent = <T extends Pick<Match, 'eventId'>>(xs: T[], value: EventFilterValue): T[] =>
  value === 'all' ? xs : xs.filter((m) => m.eventId === value);
