import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { bwfSeedCount, generateDraw, groupCount, nextPow2 } from '@/engine/draws';
import type { EventConfig, ID, Mode, TEvent, Tournament } from '@/engine/types';

import { usePersistentState } from '@/hooks/usePersistentState';

import { entryClub } from '@/data/clubs';
import { type Lookup, makeLookup } from '@/data/lookup';
import { publishPlan } from '@/data/ops';
import { selectDB, useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { EventDraw } from '@/components/draw/EventDraw';
import { EventChip, Pill } from '@/components/tournament/Badges';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Empty } from '@/components/ui/Empty';
import { Icon } from '@/components/ui/Icon';
import { useConfirm } from '@/components/ui/useConfirm';

import { DrawCheck } from '@/features/admin/draws/DrawCheck';
import { DrawSettings } from '@/features/admin/draws/DrawSettings';
import { SeedingList } from '@/features/admin/draws/SeedingList';

/** Unpublished draw choices for one event, saved on this device until the draw is published. */
interface DrawDraft {
  mode: Mode;
  cfg: EventConfig;
  order: ID[];
  seedsOverride: number | null;
  rng: number;
}

/**
 * Organizer's draw builder, top to bottom: one panel with the draft's numbers, its actions and every
 * setting; a one-line check of the result; then the draw itself. Seeding order opens in a side panel.
 */
export function DrawSetup({ lk, t, ev }: { lk: Lookup; t: Tournament; ev: TEvent }) {
  const publish = useStore((s) => s.publishDraw);
  const updateEvent = useStore((s) => s.updateEvent);
  const nav = useNavigate();
  const { ask, dialog } = useConfirm();
  const [seeding, setSeeding] = useState(false);

  const accepted = lk.entriesOf(ev.id).filter((e) => e.status === 'accepted');
  // levels given for this event at entry (singles vs doubles can differ), else players' general level
  const strength = lk.entryLevel;
  const byStrength = (ids: ID[]) =>
    ids
      .map((id) => accepted.find((e) => e.id === id)!)
      .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || strength(b.id) - strength(a.id))
      .map((e) => e.id);

  // Per event, so switching between MS, MD and WS (or to another page or tab) keeps each draft.
  const [d, setD, clearDraft, restored] = usePersistentState<DrawDraft>(`draw:${ev.id}`, () => ({
    mode: ev.mode,
    cfg: ev.config,
    order: byStrength(accepted.map((e) => e.id)),
    seedsOverride: ev.config.seeds || null,
    rng: ev.drawSeed ?? Math.floor(Math.random() * 1e9),
  }));
  const { mode, cfg, rng } = d;
  // Keep the saved order in step with the entry list (entries accepted or withdrawn since).
  const acceptedKey = accepted.map((e) => e.id).join();
  const order = useMemo(() => {
    const ids = new Set(accepted.map((e) => e.id));
    const kept = d.order.filter((id) => ids.has(id));
    return [...kept, ...byStrength([...ids].filter((id) => !kept.includes(id)))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.order, acceptedKey]);

  const n = order.length;
  const defaultSeeds = mode === 'round_robin' ? Math.min(n, groupCount(n, cfg.groupSize)) : bwfSeedCount(n);
  const seeds = Math.min(n, d.seedsOverride ?? defaultSeeds);

  const draft: TEvent = { ...ev, mode, config: { ...cfg, seeds } };
  const plan = useMemo(() => {
    if (n < 2) return null;
    return generateDraw({
      event: draft,
      entryIds: order,
      seeds,
      rngSeed: rng,
      // "No club" players are never clubmates (see data/clubs)
      clubOf: (id) => entryClub(lk.playersOfEntry(id)),
      nameOf: (id) => lk.entryName(id),
      levelOf: strength,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cfg, seeds, order, rng, n]);

  // Preview: run the plan through the same publish path on a copy of the data.
  const preview = useMemo(() => {
    if (!plan) return null;
    // read the data once per preview instead of subscribing to every store change
    const state = selectDB(useStore.getState());
    const db = publishPlan({ ...state, events: state.events.map((e) => (e.id === ev.id ? draft : e)) }, ev.id, plan, rng);
    return {
      lk: makeLookup({ ...state, ...db }),
      count: db.matches.filter((m) => m.eventId === ev.id && m.number > 0 && m.status !== 'bye').length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const doPublish = () => {
    if (!plan) return;
    updateEvent(ev.id, { mode, config: { ...cfg, seeds } });
    publish(ev.id, plan, rng, order);
    clearDraft();
    toast(`${ev.name} draw published. Matches are ready to call.`);
    nav(`/admin/t/${t.id}/draws/${ev.id}`);
  };

  if (n < 2)
    return (
      <Empty
        icon="users"
        title="Not enough entries yet"
        body={`${ev.name} has ${n} accepted ${n === 1 ? 'entry' : 'entries'}. Accept at least 2 to make a draw.`}
        action={
          <ButtonLink to={`/admin/t/${t.id}/entries`} variant="primary">
            Go to entries
          </ButtonLink>
        }
      />
    );

  const S = nextPow2(n);
  const facts =
    mode === 'round_robin'
      ? `${groupCount(n, cfg.groupSize)} groups · ${preview?.count ?? 0} matches`
      : `${S}-draw · ${S - n} bye${S - n === 1 ? '' : 's'} · ${preview?.count ?? 0} matches`;

  return (
    <div className="flex flex-col gap-3">
      {restored && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-info-soft px-3 py-2 text-[13px] text-info"
          role="status"
        >
          <span className="flex items-center gap-2 font-medium">
            <Icon name="info" size={16} /> Your unpublished setup for {ev.name} was kept.
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="text-info"
            onClick={() =>
              ask({
                title: `Start the ${ev.name} setup over?`,
                body: 'Your format, options and seeding changes go back to the defaults. Nothing is published.',
                confirmLabel: 'Start over',
                danger: true,
                onConfirm: clearDraft,
              })
            }
          >
            Start over
          </Button>
        </div>
      )}
      {dialog}

      <section className="panel flex flex-col divide-y divide-line" aria-label={`${ev.name} draw setup`}>
        <div className="flex flex-col gap-2.5 p-3 sm:flex-row sm:items-center sm:px-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <EventChip kind={ev.kind} />
              <h2 className="min-w-0 truncate font-display text-[17px] font-extrabold leading-tight">{ev.name}</h2>
              <Pill tone="warn">Draft</Pill>
            </div>
            <p className="mt-0.5 text-[13px] text-muted">
              <span className="num">{n}</span> entries · <span className="num">{facts}</span> · players see nothing until you publish
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={<Icon name="ranking" size={16} />} onClick={() => setSeeding(true)}>
              Seeding order
            </Button>
            <Button
              size="sm"
              icon={<Icon name="shuffle" size={16} />}
              onClick={() => setD((x) => ({ ...x, rng: Math.floor(Math.random() * 1e9) }))}
              title="Redraw the unseeded players"
            >
              Shuffle
            </Button>
            <Button size="sm" variant="primary" icon={<Icon name="send" size={16} />} onClick={doPublish}>
              Publish draw
            </Button>
          </div>
        </div>
        <div className="p-3 sm:px-4">
          <DrawSettings
            mode={mode}
            onModeChange={(m) => setD((x) => ({ ...x, mode: m, seedsOverride: null }))}
            cfg={cfg}
            onCfgChange={(c) => setD((x) => ({ ...x, cfg: c }))}
            n={n}
            seeds={seeds}
            onSeedsChange={(v) => setD((x) => ({ ...x, seedsOverride: v }))}
          />
        </div>
        {preview && (
          <div className="p-3 sm:px-4">
            <DrawCheck lk={preview.lk} ev={draft} levelOf={strength} warnings={plan?.warnings ?? []} />
          </div>
        )}
      </section>

      <div className="min-w-0">
        {preview && <EventDraw key={`${mode}-${rng}-${JSON.stringify(cfg)}-${seeds}-${order.join()}`} lk={preview.lk} ev={draft} />}
      </div>

      <Dialog
        open={seeding}
        onClose={() => setSeeding(false)}
        side="right"
        title="Seeding order"
        subtitle={`${ev.name} · ${n} entries`}
        footer={
          <Button variant="primary" onClick={() => setSeeding(false)}>
            Done
          </Button>
        }
      >
        <SeedingList
          lk={lk}
          order={order}
          onOrderChange={(o) => setD((x) => ({ ...x, order: o }))}
          seeds={seeds}
          pairing={cfg.pairing}
          levelOf={strength}
        />
      </Dialog>
    </div>
  );
}
