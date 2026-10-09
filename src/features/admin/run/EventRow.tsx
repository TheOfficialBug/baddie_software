import type { ReactNode } from 'react';

import type { TEvent } from '@/engine/types';

import { EventChip } from '@/components/tournament/Badges';

/** One event in a stage list: what it is, where it stands, and its buttons. Stacks on phones. */
export function EventRow({ ev, status, detail, actions }: { ev: TEvent; status?: ReactNode; detail: ReactNode; actions?: ReactNode }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <EventChip kind={ev.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[15px] font-semibold">{ev.name}</span>
            {status}
          </div>
          <div className="text-[13px] text-muted">{detail}</div>
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{actions}</div>}
    </li>
  );
}
