import { useState } from 'react';

import type { TEvent, Tournament } from '@/engine/types';

import type { Lookup } from '@/data/lookup';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { useAccess } from '@/auth/useAccess';

import { Pill } from '@/components/tournament/Badges';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useConfirm } from '@/components/ui/useConfirm';

import { ImportDrawsDialog } from '@/features/admin/draws/ImportDrawsDialog';
import { resetDrawOptions } from '@/features/admin/draws/resetOptions';
import { EventRow } from '@/features/admin/run/EventRow';
import { formatName, type Progress } from '@/features/admin/run/stages';

/** Every event's draw in one list: draw it in one tap, customize it, look at it, or redo it. */
export function DrawsStage({ lk, t, p }: { lk: Lookup; t: Tournament; p: Progress }) {
  const access = useAccess();
  const drawEvent = useStore((s) => s.drawEvent);
  const resetDraw = useStore((s) => s.resetEventDraw);
  const drafts = useStore((s) => s.drawDrafts);
  const { ask, dialog } = useConfirm();
  const [importing, setImporting] = useState(false);
  const canDraw = access.can('manage_draws', t.organizationId);
  const base = `/admin/t/${t.id}/draws`;

  const row = (ev: TEvent) => {
    const entries = lk.entriesOf(ev.id).filter((e) => e.status === 'accepted').length;
    const ms = lk.matchesOfEvent(ev.id).filter((m) => m.status !== 'bye' && m.number > 0);
    const drawn = ev.drawState === 'published';
    const tooFew = entries < 2;

    const hasSaved = drafts.some((d) => d.eventId === ev.id);
    const status = drawn ? (
      <>
        <Pill tone="ok">
          <Icon name="check" size={13} strokeWidth={2.6} /> Drawn
        </Pill>
        {hasSaved && <Pill tone="info">Changes saved, not published</Pill>}
      </>
    ) : tooFew ? (
      <Pill tone="muted">Needs 2 entries</Pill>
    ) : (
      <Pill tone="warn">Not drawn</Pill>
    );

    const detail = (
      <>
        <span className="num">{entries}</span> {entries === 1 ? 'entry' : 'entries'} · {formatName(ev)}
        {drawn && (
          <>
            {' '}
            · <span className="num">{ms.length}</span> matches
          </>
        )}
      </>
    );

    let actions = null;
    if (drawn)
      actions = (
        <>
          <ButtonLink size="sm" to={`${base}/${ev.id}`} icon={<Icon name="view" size={16} />}>
            View
          </ButtonLink>
          {canDraw && (
            <ButtonLink size="sm" to={`${base}/${ev.id}?edit=1`} icon={<Icon name="edit" size={16} />}>
              {hasSaved ? 'Continue editing' : 'Edit'}
            </ButtonLink>
          )}
          {canDraw && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Icon name="refresh" size={16} />}
              onClick={() => ask(resetDrawOptions(lk, ev, resetDraw))}
            >
              Reset
            </Button>
          )}
        </>
      );
    else if (canDraw && !tooFew)
      actions = (
        <>
          <Button
            size="sm"
            variant="primary"
            icon={<Icon name="shuffle" size={16} />}
            onClick={() => {
              if (drawEvent(ev.id)) toast(`${ev.name} draw published`, { detail: 'Players can see who they play.' });
            }}
          >
            Draw now
          </Button>
          <ButtonLink size="sm" to={`${base}/${ev.id}`} icon={<Icon name="settings" size={16} />}>
            Customize
          </ButtonLink>
        </>
      );

    return <EventRow key={ev.id} ev={ev} status={status} detail={detail} actions={actions} />;
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="draws-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="draws-title" className="font-display text-[20px] font-bold">
            Draws
          </h2>
          <p className="text-[14px] text-muted">
            <span className="num">{p.drawn.length}</span> of <span className="num">{p.events.length}</span> events drawn.{' '}
            <span className="hidden sm:inline">
              Draw now uses level seeding and keeps clubmates apart; Customize lets you change the format and seeds first.
            </span>
          </p>
        </div>
        {canDraw && (
          <Button size="sm" icon={<Icon name="upload" size={16} />} onClick={() => setImporting(true)}>
            Import from tournamentsoftware
          </Button>
        )}
      </div>
      <ul className="panel divide-y divide-line">{p.events.map(row)}</ul>
      {dialog}
      {importing && <ImportDrawsDialog t={t} onClose={() => setImporting(false)} />}
    </section>
  );
}
