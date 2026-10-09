import { Link } from 'react-router';

import type { TEvent, Tournament } from '@/engine/types';

import type { Lookup } from '@/data/lookup';
import { champions } from '@/data/queries';

import { modeSummary } from '@/components/draw/modeLabels';
import { EventChip, FlightBadge, LiveDot, Pill } from '@/components/tournament/Badges';
import { Icon } from '@/components/ui/Icon';
import { ProgressBar } from '@/components/ui/ProgressBar';

export function EventCard({ lk, t, ev }: { lk: Lookup; t: Tournament; ev: TEvent }) {
  const entries = lk.entriesOf(ev.id).filter((e) => e.status === 'accepted');
  const ms = lk.matchesOfEvent(ev.id).filter((m) => m.status !== 'bye');
  const done = ms.filter((m) => m.status === 'finished').length;
  const live = ms.filter((m) => m.status === 'on_court').length;
  const champs = champions(lk, ev);
  const flights = lk.stagesOf(ev.id).filter((s) => s.flight);

  return (
    <Link to={`/t/${t.slug}/draws/${ev.id}`} className="panel panel-hover group flex min-w-0 flex-col gap-3 p-5">
      <div className="flex items-center gap-2.5">
        <EventChip kind={ev.kind} />
        {live > 0 && (
          <Pill tone="live" className="ml-auto">
            <LiveDot /> {live} live
          </Pill>
        )}
      </div>
      <div>
        <h3 className="font-display text-[20px] font-bold leading-tight">{ev.name}</h3>
        <p className="mt-1 text-[13.5px] text-muted">{modeSummary(ev)}</p>
      </div>
      {flights.length > 0 && (
        <div className="flex items-center gap-1.5">
          {flights.map((s) => (
            <FlightBadge key={s.id} flight={s.flight!} size="sm" />
          ))}
        </div>
      )}
      {champs.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {champs.slice(0, 4).map((c) => (
            <li key={c.label} className="flex min-w-0 items-center gap-2 text-[13.5px]">
              <Icon name="trophy" size={15} className="text-gold" />
              <span className="shrink-0 text-muted">{c.label}</span>
              <span className="truncate font-semibold">{c.name}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-col gap-1.5 pt-1">
        <ProgressBar value={done} max={ms.length} tone="ink" className="h-1.5" />
        <div className="num flex justify-between text-[12px] text-muted">
          <span>
            {entries.length} {ev.kind.endsWith('D') ? 'pairs' : 'players'}
          </span>
          <span>{ms.length ? `${done}/${ms.length} played` : 'Draw coming soon'}</span>
        </div>
      </div>
    </Link>
  );
}
