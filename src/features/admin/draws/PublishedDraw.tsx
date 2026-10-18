import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';

import type { Match, TEvent, Tournament } from '@/engine/types';

import { useNow } from '@/hooks/useNow';
import { fmtAgo } from '@/lib/format';

import { type Lookup } from '@/data/lookup';
import { useStore } from '@/data/store';

import { EventDraw } from '@/components/draw/EventDraw';
import { modeSummary } from '@/components/draw/modeLabels';
import { EventChip, Pill } from '@/components/tournament/Badges';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useConfirm } from '@/components/ui/useConfirm';

import { useAdmin } from '@/features/admin/adminContext';
import { DrawEditor } from '@/features/admin/draws/DrawEditor';
import { resetDrawOptions, resetResultsOptions } from '@/features/admin/draws/resetOptions';

export function PublishedDraw({ lk, t, ev }: { lk: Lookup; t: Tournament; ev: TEvent }) {
  const resetDraw = useStore((s) => s.resetEventDraw);
  const resetResults = useStore((s) => s.resetEventResults);
  const { openScore } = useAdmin();
  const { ask, dialog } = useConfirm();
  const ms = lk.matchesOfEvent(ev.id).filter((m) => m.status !== 'bye' && m.number > 0);
  const started = ms.filter((m) => m.status === 'finished' || m.status === 'on_court').length;
  // ?edit=1 opens the placement editor (linked from the tournament home)
  const [params, setParams] = useSearchParams();
  const editing = params.get('edit') === '1';
  // the flight tab on show: Edit placements works on that flight (B, C, D) or on the starting draw
  const [flight, setFlight] = useState<string | undefined>();
  const lower = flight ? lk.stage(flight) : undefined;
  const lowerFlight = lower && lower.order > 0 && !lower.placement ? lower : undefined;
  const setEditing = (on: boolean) =>
    setParams(on ? { edit: '1', ...(lowerFlight ? { flight: lowerFlight.id } : {}) } : {}, { replace: true });
  // changes saved in the editor but not published yet
  const saved = useStore((s) => s.drawDrafts.find((d) => d.eventId === ev.id));
  const now = useNow(30000);
  // stable, so bracket boxes can skip re-rendering on a live point elsewhere
  // any real match opens for scoring (a match without a number yet must still be scoreable)
  const openMatch = useCallback((m: Match) => m.status !== 'bye' && m.a !== 'BYE' && m.b !== 'BYE' && openScore(m.id), [openScore]);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <EventChip kind={ev.kind} />
            <h2 className="min-w-0 truncate font-display text-[18px] font-extrabold leading-tight">{ev.name}</h2>
            <Pill tone="ok">
              <Icon name="check" size={14} strokeWidth={2.4} /> Published
            </Pill>
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {modeSummary(ev)} · <span className="num">{ms.length}</span> matches · <span className="num">{started}</span> started or played
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editing && (
            <Button size="sm" variant="primary" icon={<Icon name="edit" size={16} />} onClick={() => setEditing(true)}>
              {saved ? 'Continue editing' : lowerFlight ? `Edit Flight ${lowerFlight.flight} placements` : 'Edit placements'}
            </Button>
          )}
          <ButtonLink size="sm" to={`/t/${t.slug}/draws/${ev.id}`} icon={<Icon name="external" size={16} />}>
            Public view
          </ButtonLink>
          {started > 0 && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Icon name="undo" size={16} />}
              onClick={() => ask(resetResultsOptions(lk, ev, resetResults))}
            >
              Clear results
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<Icon name="refresh" size={16} />}
            onClick={() => ask(resetDrawOptions(lk, ev, resetDraw))}
          >
            Reset draw
          </Button>
        </div>
      </div>
      {dialog}
      {editing ? (
        <DrawEditor lk={lk} ev={ev} stageId={params.get('flight') ?? undefined} onDone={() => setEditing(false)} />
      ) : (
        <>
          {saved && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-info-soft px-3 py-2 text-[13px] text-info" role="status">
              <Icon name="info" size={16} className="shrink-0" />
              <span className="min-w-0 flex-1 font-medium">
                You have changes saved {fmtAgo(saved.savedAt, now)} that aren&apos;t published yet. Players still see the draw below.
              </span>
              <Button size="sm" variant="ghost" className="text-info" onClick={() => setEditing(true)}>
                Continue editing
              </Button>
            </div>
          )}
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <Icon name="edit" size={15} /> Tap a match to enter or fix its score. To move players, use Edit placements.
          </p>
          <div className="min-w-0">
            <EventDraw lk={lk} ev={ev} onOpen={openMatch} onFlight={setFlight} />
          </div>
        </>
      )}
    </div>
  );
}
