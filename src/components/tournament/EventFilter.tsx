import type { ID, TEvent } from '@/engine/types';

import { cn } from '@/lib/cn';

import type { EventFilterValue } from '@/components/tournament/filterByEvent';

/**
 * Narrow a match-day screen to one event while all events share the courts. Shows how many
 * matches each event has in play (`countOf`), so the desk sees where the action is.
 */
export function EventFilter({
  events,
  value,
  onChange,
  countOf,
  className,
}: {
  events: TEvent[];
  value: EventFilterValue;
  onChange: (v: EventFilterValue) => void;
  countOf: (eventId: ID | 'all') => number;
  className?: string;
}) {
  const options: { id: EventFilterValue; label: string; code?: string }[] = [
    { id: 'all', label: 'All events' },
    ...events.map((e) => ({ id: e.id, label: e.name.replace(/^Open /, ''), code: e.kind })),
  ];
  return (
    <div
      role="group"
      aria-label="Show event"
      className={cn('scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0', className)}
    >
      {options.map((o) => {
        const on = o.id === value;
        const n = countOf(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={cn(
              'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors touch:min-h-11',
              on ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-fg hover:border-fg/50',
            )}
          >
            {o.code && <span className={cn('num text-[11.5px]', on ? 'opacity-70' : 'text-muted')}>{o.code}</span>}
            {o.label}
            <span className={cn('num rounded-full px-1.5 text-[11.5px]', on ? 'bg-bg/20' : 'bg-sunken text-muted')}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}
