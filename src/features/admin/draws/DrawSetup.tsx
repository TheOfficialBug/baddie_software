import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { bwfSeedCount, generateDraw, groupCount, nextPow2 } from '@/engine/draws';
import type { EventConfig, ID, Mode, TEvent, Tournament } from '@/engine/types';

import { usePersistentState } from '@/hooks/usePersistentState';
import { cn } from '@/lib/cn';

import { entryClub } from '@/data/clubs';
import { type Lookup, makeLookup } from '@/data/lookup';
import { applySeeds, publishPlan } from '@/data/ops';
import { selectDB, useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { Bracket } from '@/components/draw/Bracket';
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
import { restoreLevels, type Snapshot, takeSnapshot } from '@/features/admin/draws/seedingSnapshot';

/** Unpublished draw choices for one event, saved on this device until the draw is published. */
interface DrawDraft {
  mode: Mode;
  cfg: EventConfig;
  order: ID[];
  seedsOverride: number | null;
  rng: number;
  /** First-round lines moved by hand (knockout and drop flight); cleared when anything else changes. */
  lines?: (ID | 'BYE')[] | null;
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
  const setEntryLevel = useStore((s) => s.setEntryLevel);
  const [seeding, setSeeding] = useState(false);
  // the order and levels when the seeding panel opened: Cancel goes back to them
  // Cleared by Save. A ref, not state: closing the dialog also fires its close event (which cancels),
  // and that must see that Save already happened.
  const seedingStart = useRef<Snapshot | null>(null);

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
  // hand-moved first round, while it still holds exactly this event's entries
  const fixed = useMemo(() => {
    const l = d.lines;
    if (!l || mode === 'round_robin') return null;
    const placed = l.filter((x) => x !== 'BYE');
    return placed.length === order.length && placed.every((x) => order.includes(x)) ? l : null;
  }, [d.lines, order, mode]);
  const [moving, setMoving] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);

  const openSeeding = () => {
    seedingStart.current = takeSnapshot(lk, order);
    setSeeding(true);
  };
  /** Discard what changed in the panel (order and levels) and close it. */
  const cancelSeeding = () => {
    const start = seedingStart.current;
    seedingStart.current = null;
    if (start) {
      setD((x) => ({ ...x, order: start.order, lines: null }));
      restoreLevels(lk, start, setEntryLevel);
    }
    setSeeding(false);
  };
  const saveSeeding = () => {
    seedingStart.current = null;
    setSeeding(false);
    toast('Seeding order saved');
  };
  const defaultSeeds = mode === 'round_robin' ? Math.min(n, groupCount(n, cfg.groupSize)) : bwfSeedCount(n);
  const seeds = Math.min(n, d.seedsOverride ?? defaultSeeds);

  const draft: TEvent = { ...ev, mode, config: { ...cfg, seeds } };
  // levels changed in the seeding panel (or on the entries page) redraw too, not only a new order
  const levelsKey = order.map(strength).join();
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
      lines: fixed ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cfg, seeds, order, rng, n, levelsKey, fixed]);

  // Preview: run the plan through the same publish path on a copy of the data.
  const preview = useMemo(() => {
    if (!plan) return null;
    // read the data once per preview instead of subscribing to every store change
    const state = selectDB(useStore.getState());
    // seed numbers as they'll be on publish, so the preview shows [1], [2] … too
    const db = applySeeds(
      publishPlan({ ...state, events: state.events.map((e) => (e.id === ev.id ? draft : e)) }, ev.id, plan, rng),
      ev.id,
      order,
    );
    return {
      lk: makeLookup({ ...state, ...db }),
      count: db.matches.filter((m) => m.eventId === ev.id && m.number > 0 && m.status !== 'bye').length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  // the first round as drawn now: two places per line (an entry or a bye)
  const firstStage = plan?.stages[0];
  const firstRound =
    plan && firstStage ? plan.matches.filter((m) => m.stageId === firstStage.id && m.round === 1).sort((a, b) => a.index - b.index) : [];
  const currentLines = firstRound.flatMap((m) => [m.srcA, m.srcB].map((x) => (x.kind === 'entry' ? x.entryId : ('BYE' as const))));
  const canMove = mode !== 'round_robin' && firstStage?.kind === 'knockout' && currentLines.length > 0;
  /** Tap one place, then another: the two swap (a player and a bye place swap too). */
  const pick = (at: number) => {
    if (picked === null) return setPicked(currentLines[at] === 'BYE' ? null : at);
    if (picked === at) return setPicked(null);
    const next = currentLines.slice();
    [next[picked], next[at]] = [next[at], next[picked]];
    setPicked(null);
    // a line with nobody in it would be a bye later in the bracket
    if ([picked, at].some((p) => next[p] === 'BYE' && next[p ^ 1] === 'BYE')) {
      toast('That would leave a line with nobody in it', { tone: 'error', detail: 'Swap with a player, or with a bye next to a player.' });
      return;
    }
    setD((x) => ({ ...x, lines: next }));
  };

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

  // the first knockout's size and byes as drawn (a drop flight can move byes to round 2)
  const S = plan?.stages[0]?.size || nextPow2(n);
  // every place where a player skips a round (round 1, or a later round when a corner of the bracket is empty)
  const byes =
    plan?.matches.filter((m) => m.stageId === plan.stages[0]?.id && (m.srcA.kind === 'bye') !== (m.srcB.kind === 'bye')).length ?? 0;
  const facts =
    mode === 'round_robin'
      ? `${groupCount(n, cfg.groupSize)} groups · ${preview?.count ?? 0} matches`
      : mode === 'drop_flight' && cfg.variant === 'PLACEMENT'
        ? `2 placement rounds, then 4 flights · ${preview?.count ?? 0} matches`
        : `${S}-draw · ${byes} bye${byes === 1 ? '' : 's'} · ${preview?.count ?? 0} matches`;

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
            <Button size="sm" variant="ghost" icon={<Icon name="ranking" size={16} />} onClick={openSeeding}>
              Seeding order
            </Button>
            <Button
              size="sm"
              icon={<Icon name="shuffle" size={16} />}
              onClick={() => setD((x) => ({ ...x, rng: Math.floor(Math.random() * 1e9), lines: null }))}
              title="Redraw the unseeded players"
            >
              Shuffle
            </Button>
            {canMove && (
              <Button
                size="sm"
                variant={moving ? 'primary' : 'ghost'}
                icon={<Icon name={moving ? 'check' : 'drag'} size={16} />}
                onClick={() => {
                  setMoving((v) => !v);
                  setPicked(null);
                }}
                aria-pressed={moving}
              >
                {moving ? 'Done moving' : 'Move players'}
              </Button>
            )}
            <Button size="sm" variant="primary" icon={<Icon name="send" size={16} />} onClick={doPublish}>
              Publish draw
            </Button>
          </div>
        </div>
        <div className="p-3 sm:px-4">
          <DrawSettings
            mode={mode}
            onModeChange={(m) => setD((x) => ({ ...x, mode: m, seedsOverride: null, lines: null }))}
            cfg={cfg}
            onCfgChange={(c) => setD((x) => ({ ...x, cfg: c, lines: null }))}
            n={n}
            seeds={seeds}
            onSeedsChange={(v) => setD((x) => ({ ...x, seedsOverride: v, lines: null }))}
          />
        </div>
        {preview && (
          <div className="p-3 sm:px-4">
            <DrawCheck lk={preview.lk} ev={draft} levelOf={strength} warnings={plan?.warnings ?? []} />
          </div>
        )}
      </section>

      {fixed && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-info-soft px-3 py-2 text-[13px] text-info" role="status">
          <Icon name="info" size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">
            You moved players by hand; the draw uses your first round. Shuffling or changing a setting or the seeding order goes back to the
            automatic draw.
          </span>
          <Button size="sm" variant="ghost" className="text-info" onClick={() => setD((x) => ({ ...x, lines: null }))}>
            Reset placements
          </Button>
        </div>
      )}
      <div className="min-w-0">
        {preview && moving && canMove && firstStage ? (
          <Bracket
            lk={preview.lk}
            stage={firstStage}
            matches={preview.lk.matchesOfEvent(ev.id).filter((m) => m.stageId === firstStage.id)}
            toolbar={
              <div className="flex items-center gap-2 bg-surface px-3 py-2 text-[13px]">
                <Icon name="drag" size={16} className="text-muted" />
                <span className="min-w-0 flex-1">
                  {picked === null ? (
                    'Tap a player, then the player or bye place to swap them with.'
                  ) : (
                    <>
                      Swap <b>{lk.entryName(currentLines[picked] as ID)}</b> with… (tap them again to cancel)
                    </>
                  )}
                </span>
              </div>
            }
            editLine={(m) => (
              <SwapLine lk={preview.lk} at={2 * m.index} lines={currentLines} picked={picked} onPick={pick} levelOf={strength} />
            )}
          />
        ) : (
          preview && (
            <EventDraw
              key={`${mode}-${rng}-${JSON.stringify(cfg)}-${seeds}-${order.join()}-${(fixed ?? []).join()}`}
              lk={preview.lk}
              ev={draft}
            />
          )
        )}
      </div>

      <Dialog
        open={seeding}
        onClose={cancelSeeding}
        side="right"
        title="Seeding order"
        subtitle={`${ev.name} · ${n} entries`}
        footer={
          <>
            <Button variant="ghost" onClick={cancelSeeding}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveSeeding}>
              Save
            </Button>
          </>
        }
      >
        <SeedingList
          lk={lk}
          eventId={ev.id}
          order={order}
          onOrderChange={(o) => setD((x) => ({ ...x, order: o, lines: null }))}
          defaultOrder={() => byStrength(order)}
          seeds={seeds}
          pairing={cfg.pairing}
          placement={mode === 'drop_flight' && cfg.variant === 'PLACEMENT'}
          levelOf={strength}
        />
      </Dialog>
    </div>
  );
}

const LEVEL = (v: number) =>
  v >= 3.75 ? 'A' : v >= 3.25 ? 'A/B' : v >= 2.75 ? 'B' : v >= 2.25 ? 'B/C' : v >= 1.75 ? 'C' : v >= 1.25 ? 'C/D' : 'D';

/** One first-round line while moving players: two places to tap (a player or a bye). */
function SwapLine({
  lk,
  at,
  lines,
  picked,
  onPick,
  levelOf,
}: {
  lk: Lookup;
  at: number;
  lines: (ID | 'BYE')[];
  picked: number | null;
  onPick: (at: number) => void;
  levelOf: (id: ID) => number;
}) {
  return (
    <section className="flex w-full overflow-hidden rounded-md border border-line-strong/70 bg-surface">
      <ul className="min-w-0 flex-1 divide-y divide-line">
        {[at, at + 1].map((p) => {
          const e = lines[p];
          const seed = e !== 'BYE' ? lk.entry(e)?.seed : undefined;
          return (
            <li key={p}>
              <button
                type="button"
                onClick={() => onPick(p)}
                disabled={e === 'BYE' && picked === null}
                aria-pressed={picked === p}
                className={cn(
                  'flex h-7 w-full items-center gap-1.5 px-2 text-left text-[12.5px] transition-colors',
                  picked === p ? 'bg-primary text-primary-fg' : picked !== null ? 'hover:bg-primary/15' : 'hover:bg-sunken',
                  e === 'BYE' && 'italic text-faint',
                )}
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {e === 'BYE' ? 'Bye' : lk.entryName(e)}
                  {seed ? <span className="num ml-1 text-[10px] font-semibold opacity-70">[{seed}]</span> : null}
                </span>
                {e !== 'BYE' && <span className="num shrink-0 text-[10.5px] font-semibold opacity-70">{LEVEL(levelOf(e))}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
