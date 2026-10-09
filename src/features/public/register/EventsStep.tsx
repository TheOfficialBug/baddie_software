import type { Dispatch, SetStateAction } from 'react';

import type { Player, TEvent, Tournament } from '@/engine/types';

import { cn } from '@/lib/cn';
import { money } from '@/lib/format';

import { eligibility, isDoubles } from '@/data/eligibility';

import { EventChip } from '@/components/tournament/Badges';
import { Icon } from '@/components/ui/Icon';

import { emptyDetails, formatOf, type Picks, type Registrant } from '@/features/public/register/registrationTypes';

type Props = {
  t: Tournament;
  me: Registrant;
  events: TEvent[];
  picked: Picks;
  setPicked: Dispatch<SetStateAction<Picks>>;
  error?: string;
};

/** Step 2: tick the events to enter. Levels and partners come next. */
export function EventsStep({ t, me, events, picked, setPicked, error }: Props) {
  const profile = { id: 'new', level: 'C', ...me } as Player;
  const toggle = (ev: TEvent) =>
    setPicked((x) => {
      const n = { ...x };
      if (ev.id in n) delete n[ev.id];
      else n[ev.id] = emptyDetails();
      return n;
    });

  return (
    <section aria-labelledby="step-events" className="flex flex-col gap-3">
      <div>
        <h2 id="step-events" className="mb-1 font-display text-[clamp(20px,2.4vw,24px)] font-extrabold">
          Pick your events
        </h2>
        <p className="text-[14px] text-muted">Tap to add. Events you can't enter are greyed out with the reason.</p>
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-[14px] font-medium text-live">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
      <ul className="flex flex-col gap-2.5">
        {events.map((ev) => {
          const why = eligibility(ev, t, profile);
          const on = ev.id in picked;
          return (
            <li key={ev.id}>
              <button
                type="button"
                disabled={!!why}
                aria-pressed={on}
                onClick={() => toggle(ev)}
                className={cn(
                  'panel flex min-h-[72px] w-full items-center gap-3 p-4 text-left transition-colors sm:px-5',
                  on ? 'border-fg ring-1 ring-fg' : !why && 'hover:border-fg/40',
                  why && 'cursor-not-allowed opacity-55',
                )}
              >
                <span
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors',
                    on ? 'border-fg bg-fg text-bg' : 'border-line-strong',
                  )}
                >
                  {on && <Icon name="check" size={16} strokeWidth={2.6} />}
                </span>
                <EventChip kind={ev.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{ev.name}</span>
                  <span className={cn('block text-[13px]', why ? 'text-warn' : 'text-muted')}>
                    {why ?? (isDoubles(ev.kind) ? `${formatOf(ev.kind)}: add your partner next` : 'Singles')}
                  </span>
                </span>
                <span className="num shrink-0 font-semibold">{money(ev.fee)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
