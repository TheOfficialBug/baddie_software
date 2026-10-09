import { useState } from 'react';
import { useParams } from 'react-router';

import type { TEvent } from '@/engine/types';

import { cn } from '@/lib/cn';

import { useLookup } from '@/data/lookup';

import { MODE_LABEL } from '@/components/draw/modeLabels';
import { NotFound } from '@/components/NotFound';
import { EventChip, Pill } from '@/components/tournament/Badges';
import { Button } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterChips } from '@/components/ui/Tabs';

import { EventDialog } from '@/features/admin/entries/EventDialog';
import { EventEntries } from '@/features/admin/entries/EventEntries';

export function AdminEvents() {
  const { tid } = useParams();
  const lk = useLookup();
  const t = lk.tournament(tid);
  const events = t ? lk.eventsOf(t.id) : [];
  const [sel, setSel] = useState<string | undefined>(events[0]?.id);
  const [editing, setEditing] = useState<TEvent | 'new' | null>(null);
  if (!t) return <NotFound what="tournament" />;
  const ev = lk.event(sel) ?? events[0];
  const pendingOf = (e: TEvent) => lk.entriesOf(e.id).filter((x) => x.status === 'pending').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t.name}
        title="Entries"
        description="The events players can enter, and who has entered each one. Confirm entries here before you make the draws."
        actions={
          <Button variant="primary" icon={<Icon name="add" size={18} />} onClick={() => setEditing('new')}>
            Add event
          </Button>
        }
      />

      {events.length === 0 ? (
        <Empty
          icon="task"
          title="No events yet"
          body="Add the events players can enter, like Men's Singles or Mixed Doubles."
          action={
            <Button variant="primary" icon={<Icon name="add" size={18} />} onClick={() => setEditing('new')}>
              Add the first event
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          {/* Phones and tablets: a sideways list of chips above the entries. */}
          <div className="lg:hidden">
            <FilterChips
              label="Event"
              value={ev?.id ?? ''}
              onChange={setSel}
              options={events.map((e) => {
                const p = pendingOf(e);
                return {
                  value: e.id,
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="num opacity-70">{e.kind}</span>
                      {e.name}
                      {p > 0 && <span className="num rounded-full bg-warn-soft px-1.5 text-[11px] text-warn">{p}</span>}
                    </span>
                  ),
                };
              })}
            />
          </div>

          {/* Laptops and up: a side list. */}
          <nav className="hidden flex-col gap-2 lg:flex" aria-label="Events">
            {events.map((e) => {
              const n = lk.entriesOf(e.id).filter((x) => x.status !== 'withdrawn');
              const pending = pendingOf(e);
              const on = ev?.id === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-current={on ? 'true' : undefined}
                  onClick={() => setSel(e.id)}
                  className={cn(
                    'flex min-h-[64px] items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors',
                    on ? 'border-fg bg-surface shadow-lift' : 'border-line bg-surface hover:border-fg/40',
                  )}
                >
                  <EventChip kind={e.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{e.name}</div>
                    <div className="truncate text-[12.5px] text-muted">
                      {MODE_LABEL[e.mode]} · <span className="num">{n.length}</span> {n.length === 1 ? 'entry' : 'entries'}
                    </div>
                  </div>
                  {pending > 0 ? <Pill tone="warn">{pending} new</Pill> : e.drawState === 'published' ? <Pill tone="ok">Drawn</Pill> : null}
                </button>
              );
            })}
          </nav>

          {ev && <EventEntries key={ev.id} lk={lk} t={t} ev={ev} onEdit={() => setEditing(ev)} />}
        </div>
      )}
      {editing && (
        <EventDialog
          t={t}
          ev={editing === 'new' ? null : editing}
          onClose={(id) => {
            setEditing(null);
            if (id) setSel(id);
          }}
        />
      )}
    </div>
  );
}
