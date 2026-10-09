import type { Tournament } from '@/engine/types';

import type { Lookup } from '@/data/lookup';
import { champions } from '@/data/queries';

import { EventChip } from '@/components/tournament/Badges';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

import type { Progress } from '@/features/admin/run/stages';

/** The winners of every event, ready to read out at the prize giving. */
export function FinishedStage({ lk, t, p }: { lk: Lookup; t: Tournament; p: Progress }) {
  const rows = p.events.flatMap((ev) => champions(lk, ev).map((c) => ({ ev, c })));
  return (
    <section className="flex flex-col gap-3" aria-labelledby="done-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="done-title" className="font-display text-[20px] font-bold">
            Winners
          </h2>
          <p className="text-[14px] text-muted">
            <span className="num">{p.played}</span> of <span className="num">{p.matches}</span> matches played.
          </p>
        </div>
        <ButtonLink to={`/t/${t.slug}`} icon={<Icon name="external" size={17} />}>
          Public results
        </ButtonLink>
      </div>
      {rows.length ? (
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ ev, c }) => (
            <li key={`${ev.id}-${c.label}`} className="panel flex min-w-0 items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-fg">
                <Icon name="trophy" size={19} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  <EventChip kind={ev.kind} /> {c.label}
                </span>
                <span className="truncate text-[15px] font-semibold">{c.name}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel p-5 text-[14px] text-muted">No event has a winner yet.</p>
      )}
    </section>
  );
}
