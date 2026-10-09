// Display names and colour classes for events and flights.
import type { EventKind, FlightLabel } from '@/engine/types';

export const EVENT_NAME: Record<EventKind, string> = {
  MS: "Men's singles",
  WS: "Women's singles",
  MD: "Men's doubles",
  WD: "Women's doubles",
  XD: 'Mixed doubles',
};

export const FLIGHT_TEXT: Record<FlightLabel, string> = { A: 'text-fa', B: 'text-fb', C: 'text-fc', D: 'text-fd' };

export const FLIGHT_BG: Record<FlightLabel, string> = { A: 'bg-fa', B: 'bg-fb', C: 'bg-fc', D: 'bg-fd' };
