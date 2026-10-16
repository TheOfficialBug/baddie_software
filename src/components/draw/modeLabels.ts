// Human-readable names for draw formats.
import type { TEvent } from '@/engine/types';

export const MODE_LABEL: Record<TEvent['mode'], string> = {
  round_robin: 'Round robin',
  drop_flight: 'Drop flight',
  knockout: 'Knockout',
};

export function modeSummary(ev: TEvent): string {
  const c = ev.config;
  if (ev.mode === 'round_robin')
    return c.advance ? `Round robin groups, top ${c.advance} to a knockout` : 'Round robin, everyone plays everyone';
  if (ev.mode === 'drop_flight')
    return c.variant === 'ABCD'
      ? 'Drop flight A/B/C/D, about 3 matches each'
      : c.variant === 'PLACEMENT'
        ? 'Drop flight by results: two placement rounds sort everyone into flights A–D, at least 3 matches for most'
        : 'Drop flight A/B, at least 2 matches each';
  return ['Knockout', c.plate && 'with a plate for first-round losers', c.thirdPlace && 'and a 3rd place match'].filter(Boolean).join(' ');
}

/** Short name of a drop flight variant. */
export const VARIANT_LABEL: Record<TEvent['config']['variant'], string> = {
  ABCD: 'A/B/C/D',
  AB: 'A/B',
  PLACEMENT: 'A/B/C/D by results',
};
