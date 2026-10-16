import { useNavigate, useParams } from 'react-router';

import { cn } from '@/lib/cn';

import { useLookup } from '@/data/lookup';
import { useStore } from '@/data/store';

import { ShowLevels } from '@/components/draw/showLevels';
import { NotFound } from '@/components/NotFound';
import { EventChip } from '@/components/tournament/Badges';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';

import { DrawSetup } from '@/features/admin/draws/DrawSetup';
import { PublishedDraw } from '@/features/admin/draws/PublishedDraw';

export function DrawBuilder() {
  const { tid, eventId } = useParams();
  const lk = useLookup();
  const nav = useNavigate();
  const setStage = useStore((st) => st.setStage);
  const t = lk.tournament(tid);
  if (!t) return <NotFound what="tournament" />;
  const events = lk.eventsOf(t.id);
  const ev = lk.event(eventId) ?? events.find((e) => e.drawState !== 'published') ?? events[0];
  const drawn = events.filter((e) => e.drawState === 'published').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t.name}
        title="Draws"
        description={
          events.length ? (
            <>
              <span className="num">{drawn}</span> of <span className="num">{events.length}</span> events drawn.
            </>
          ) : undefined
        }
      />
      {(t.status === 'registration' || t.status === 'draft') && events.length > 0 && (
        <div
          className="flex flex-col gap-3 rounded-2xl bg-warn-soft p-4 text-warn sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p className="flex items-start gap-2 text-[14px] font-medium">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            Registration is still open, so entries can change. Close it before drawing, or draw now and redo it if entries change.
          </p>
          <Button variant="primary" className="shrink-0" icon={<Icon name="lock" size={18} />} onClick={() => setStage(t.id, 'closed')}>
            Close registration
          </Button>
        </div>
      )}
      {events.length === 0 ? (
        <Empty
          icon="draws"
          title="No events yet"
          body="Add events first, then come back to make the draws."
          action={
            <ButtonLink to={`/admin/t/${t.id}/entries`} variant="primary" icon={<Icon name="add" size={18} />}>
              Add events
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Events"
            className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0"
          >
            {events.map((e) => {
              const on = e.id === ev?.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => nav(`/admin/t/${t.id}/draws/${e.id}`)}
                  className={cn(
                    'flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-[14px] font-semibold transition-colors',
                    on ? 'border-fg bg-surface text-fg shadow-lift' : 'border-line bg-surface text-muted hover:border-fg/40 hover:text-fg',
                  )}
                >
                  <EventChip kind={e.kind} />
                  <span className="whitespace-nowrap">{e.name}</span>
                  {e.drawState === 'published' ? (
                    <Icon name="success" size={17} className="text-ok" label="Published" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-line-strong" aria-label="Not drawn" role="img" />
                  )}
                </button>
              );
            })}
          </div>
          {ev && (
            <ShowLevels.Provider value>
              {ev.drawState === 'published' ? (
                <PublishedDraw key={ev.id} lk={lk} t={t} ev={ev} />
              ) : (
                <DrawSetup key={ev.id} lk={lk} t={t} ev={ev} />
              )}
            </ShowLevels.Provider>
          )}
        </>
      )}
    </div>
  );
}
