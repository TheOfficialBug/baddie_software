import { groupCount, nextPow2 } from '@/engine/draws';
import type { ID, TEvent } from '@/engine/types';

import type { Lookup } from '@/data/lookup';

import { EventDraw } from '@/components/draw/EventDraw';
import { MODE_LABEL } from '@/components/draw/modeLabels';
import { Pill } from '@/components/tournament/Badges';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

import { PairingQuality } from '@/features/admin/draws/PairingQuality';

/** Step 4: sticky summary with shuffle/publish actions, plan warnings and the draft draw preview. */
export function PreviewStep({
  draft,
  n,
  warnings,
  preview,
  drawKey,
  levelOf,
  onShuffle,
  onPublish,
}: {
  draft: TEvent;
  n: number;
  warnings: string[];
  preview: { lk: Lookup; count: number } | null;
  drawKey: string;
  levelOf: (id: ID) => number;
  onShuffle: () => void;
  onPublish: () => void;
}) {
  const { mode, config: cfg } = draft;
  const S = nextPow2(n);
  const facts =
    mode === 'round_robin'
      ? `${groupCount(n, cfg.groupSize)} group${groupCount(n, cfg.groupSize) > 1 ? 's' : ''} · ${preview?.count ?? 0} matches`
      : `${S}-draw · ${S - n} bye${S - n === 1 ? '' : 's'} · ${preview?.count ?? 0} matches`;

  return (
    <section aria-labelledby="db-preview" className="flex min-w-0 flex-col gap-4">
      <div className="panel z-10 flex flex-col gap-3 p-4 shadow-card sm:flex-row sm:items-center sm:p-5 md:sticky md:top-16">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sunken text-[13px] font-semibold">4</span>
            <h2 id="db-preview" className="font-display text-[20px] font-extrabold leading-tight">
              Preview
            </h2>
            <Pill tone="warn">Draft</Pill>
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {MODE_LABEL[mode]} · <span className="num">{n}</span> entries · <span className="num">{facts}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Icon name="shuffle" size={18} />} onClick={onShuffle}>
            Shuffle again
          </Button>
          <Button variant="primary" icon={<Icon name="send" size={18} />} onClick={onPublish}>
            Publish draw
          </Button>
        </div>
      </div>
      <p className="text-[13px] text-muted">Players see nothing until you publish. Shuffle again to redraw the unseeded players.</p>
      {warnings.length > 0 && (
        <div role="status" className="flex flex-col gap-1.5 rounded-2xl bg-warn-soft p-4 text-[14px] text-warn">
          {warnings.map((w) => (
            <p key={w} className="flex items-start gap-2">
              <Icon name="alert" size={18} className="mt-0.5" /> {w}
            </p>
          ))}
        </div>
      )}
      {preview && <PairingQuality lk={preview.lk} ev={draft} levelOf={levelOf} />}
      <div className="min-w-0">{preview && <EventDraw key={drawKey} lk={preview.lk} ev={draft} />}</div>
    </section>
  );
}
