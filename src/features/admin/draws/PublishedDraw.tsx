import { useState } from 'react';

import type { TEvent, Tournament } from '@/engine/types';

import { type Lookup } from '@/data/lookup';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { EventDraw } from '@/components/draw/EventDraw';
import { modeSummary } from '@/components/draw/modeLabels';
import { EventChip, Pill } from '@/components/tournament/Badges';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

import { useAdmin } from '@/features/admin/adminContext';

export function PublishedDraw({ lk, t, ev }: { lk: Lookup; t: Tournament; ev: TEvent }) {
  const clear = useStore((s) => s.clearDraw);
  const { openScore } = useAdmin();
  const ms = lk.matchesOfEvent(ev.id).filter((m) => m.status !== 'bye' && m.number > 0);
  const started = ms.filter((m) => m.status === 'finished' || m.status === 'on_court').length;
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <EventChip kind={ev.kind} />
            <h2 className="min-w-0 truncate font-display text-[clamp(20px,2.4vw,24px)] font-extrabold leading-tight">{ev.name}</h2>
            <Pill tone="ok">
              <Icon name="check" size={14} strokeWidth={2.4} /> Published
            </Pill>
          </div>
          <p className="mt-1.5 text-[14px] text-muted">
            {modeSummary(ev)} · <span className="num">{ms.length}</span> matches · <span className="num">{started}</span> started or played
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={`/t/${t.slug}/draws/${ev.id}`} icon={<Icon name="external" size={18} />}>
            Public view
          </ButtonLink>
          <Button
            variant={confirm ? 'danger' : 'ghost'}
            disabled={started > 0}
            title={started > 0 ? 'Matches have been played, so the draw can no longer be unpublished.' : undefined}
            onClick={() => {
              if (!confirm) return setConfirm(true);
              clear(ev.id);
              toast('Draw unpublished. You can make it again.');
            }}
          >
            {confirm ? 'Tap again to unpublish' : 'Unpublish'}
          </Button>
        </div>
      </div>
      <p className="flex items-center gap-2 text-[14px] text-muted">
        <Icon name="edit" size={16} /> Tap any match to enter or fix its score.
      </p>
      <div className="min-w-0">
        <EventDraw lk={lk} ev={ev} onOpen={(m) => m.number > 0 && openScore(m.id)} />
      </div>
    </div>
  );
}
