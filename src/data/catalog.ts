import type { EventConfig, EventKind } from '@/engine/types';

/** Default event names. */
export const KIND_LABEL: Record<EventKind, string> = {
  MS: "Men's Singles",
  WS: "Women's Singles",
  MD: "Men's Doubles",
  WD: "Women's Doubles",
  XD: 'Mixed Doubles',
};

/** Starting configuration for a new event (the organizer adjusts it before drawing). */
export const BASE_EVENT_CONFIG: EventConfig = { groupSize: 4, advance: 2, variant: 'ABCD', thirdPlace: false, plate: false, seeds: 0 };
