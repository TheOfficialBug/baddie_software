// Confirm-dialog wording for resetting an event's draw or results, shared by the draw page and
// the tournament home.
import type { TEvent } from '@/engine/types';

import type { Lookup } from '@/data/lookup';
import { toast } from '@/data/toast';

import type { ConfirmOptions } from '@/components/ui/ConfirmDialog';

const playedOf = (lk: Lookup, ev: TEvent) => {
  const ms = lk.matchesOfEvent(ev.id);
  return {
    played: ms.filter((m) => m.status === 'finished').length,
    onCourt: ms.filter((m) => m.status === 'on_court').length,
  };
};

const lost = (played: number, onCourt: number) =>
  [
    played && `${played} ${played === 1 ? 'result' : 'results'} will be deleted`,
    onCourt && `${onCourt} ${onCourt === 1 ? 'match' : 'matches'} on court will be stopped`,
  ]
    .filter(Boolean)
    .join(' and ');

/** Remove the draw (and any results); the event's entries stay. */
export function resetDrawOptions(lk: Lookup, ev: TEvent, run: (eventId: string) => void): ConfirmOptions {
  const { played, onCourt } = playedOf(lk, ev);
  const warn = lost(played, onCourt);
  return {
    title: `Reset the ${ev.name} draw?`,
    body: 'The draw is removed for everyone. Entries stay, so you can make a new draw straight away.',
    warning: warn ? `${warn[0].toUpperCase()}${warn.slice(1)}. This can't be undone.` : undefined,
    confirmLabel: 'Reset draw',
    danger: true,
    onConfirm: () => {
      run(ev.id);
      toast(`${ev.name} draw reset`, { tone: 'info', detail: 'Make it again when you are ready.' });
    },
  };
}

/** Clear every result of the event; the draw stays. */
export function resetResultsOptions(lk: Lookup, ev: TEvent, run: (eventId: string) => void): ConfirmOptions {
  const { played, onCourt } = playedOf(lk, ev);
  return {
    title: `Clear all ${ev.name} results?`,
    body: 'Every match goes back to not played. The draw and match numbers stay the same.',
    warning: `${lost(played, onCourt).replace(/^./, (c) => c.toUpperCase())}. This can't be undone.`,
    confirmLabel: 'Clear results',
    danger: true,
    onConfirm: () => {
      run(ev.id);
      toast(`${ev.name} results cleared`, { tone: 'info' });
    },
  };
}
