import { useState } from 'react';

import type { TEvent, Tournament } from '@/engine/types';

import type { Lookup } from '@/data/lookup';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { useAccess } from '@/auth/useAccess';

import { Pill } from '@/components/tournament/Badges';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

import { AddEntryDialog } from '@/features/admin/entries/AddEntryDialog';
import { EventRow } from '@/features/admin/run/EventRow';
import { formatName, type Progress } from '@/features/admin/run/stages';

/** Registration at a glance: entries per event, confirm new ones, add walk-ins. */
export function RegistrationStage({ lk, t, p }: { lk: Lookup; t: Tournament; p: Progress }) {
  const access = useAccess();
  const setEntryStatus = useStore((s) => s.setEntryStatus);
  const [adding, setAdding] = useState<TEvent | null>(null);
  const canEdit = access.can('manage_entries', t.organizationId);

  const confirm = (ids: string[]) => {
    ids.forEach((id) => setEntryStatus(id, 'accepted'));
    toast(`${ids.length} ${ids.length === 1 ? 'entry' : 'entries'} confirmed`);
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="reg-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="reg-title" className="font-display text-[20px] font-bold">
            Entries
          </h2>
          <p className="text-[14px] text-muted">
            <span className="num">{p.accepted}</span> confirmed
            {p.pending.length > 0 && (
              <>
                {' '}
                · <span className="num">{p.pending.length}</span> waiting for you
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && p.pending.length > 0 && (
            <Button variant="secondary" icon={<Icon name="check" size={18} />} onClick={() => confirm(p.pending.map((e) => e.id))}>
              Confirm all {p.pending.length}
            </Button>
          )}
          <ButtonLink to={`/admin/t/${t.id}/entries`} variant="ghost" iconRight={<Icon name="right" size={17} />}>
            Full entry list
          </ButtonLink>
        </div>
      </div>

      <ul className="panel divide-y divide-line">
        {p.events.map((ev) => {
          const entries = lk.entriesOf(ev.id);
          const ok = entries.filter((e) => e.status === 'accepted').length;
          const waiting = entries.filter((e) => e.status === 'pending');
          return (
            <EventRow
              key={ev.id}
              ev={ev}
              status={waiting.length > 0 && <Pill tone="warn">{waiting.length} new</Pill>}
              detail={
                <>
                  <span className="num">{ok}</span>
                  {ev.cap ? (
                    <>
                      /<span className="num">{ev.cap}</span>
                    </>
                  ) : null}{' '}
                  confirmed · {formatName(ev)}
                </>
              }
              actions={
                canEdit && (
                  <>
                    {waiting.length > 0 && (
                      <Button size="sm" variant="primary" onClick={() => confirm(waiting.map((e) => e.id))}>
                        Confirm {waiting.length}
                      </Button>
                    )}
                    <Button size="sm" icon={<Icon name="add" size={16} />} onClick={() => setAdding(ev)}>
                      Add entry
                    </Button>
                  </>
                )
              }
            />
          );
        })}
        {p.events.length === 0 && (
          <li className="flex flex-col items-start gap-3 p-5 text-[14px] text-muted">
            No events yet.
            <ButtonLink to={`/admin/t/${t.id}/entries`} variant="primary" size="sm">
              Add events
            </ButtonLink>
          </li>
        )}
      </ul>

      {adding && <AddEntryDialog lk={lk} t={t} ev={adding} onClose={() => setAdding(null)} />}
    </section>
  );
}
