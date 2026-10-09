import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { bwfSeedCount, generateDraw, groupCount } from '@/engine/draws';
import type { EventConfig, ID, Mode, TEvent, Tournament } from '@/engine/types';

import { type Lookup, makeLookup } from '@/data/lookup';
import { publishPlan } from '@/data/ops';
import { selectDB, useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { ButtonLink } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';

import { FormatStep } from '@/features/admin/draws/FormatStep';
import { OptionsStep } from '@/features/admin/draws/OptionsStep';
import { PreviewStep } from '@/features/admin/draws/PreviewStep';
import { SeedingStep } from '@/features/admin/draws/SeedingStep';

/** Organizer's step-by-step draw builder: owns the draft state and composes the four steps. */
export function DrawSetup({ lk, t, ev }: { lk: Lookup; t: Tournament; ev: TEvent }) {
  const publish = useStore((s) => s.publishDraw);
  const updateEvent = useStore((s) => s.updateEvent);
  const nav = useNavigate();

  const accepted = lk.entriesOf(ev.id).filter((e) => e.status === 'accepted');
  // levels given for this event at entry (singles vs doubles can differ), else players' general level
  const strength = lk.entryLevel;
  const [mode, setMode] = useState<Mode>(ev.mode);
  const [cfg, setCfg] = useState<EventConfig>(ev.config);
  const [order, setOrder] = useState<ID[]>(() =>
    accepted
      .slice()
      .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || strength(b.id) - strength(a.id))
      .map((e) => e.id),
  );
  const n = order.length;
  const defaultSeeds = mode === 'round_robin' ? Math.min(n, groupCount(n, cfg.groupSize)) : bwfSeedCount(n);
  const [seedsOverride, setSeedsOverride] = useState<number | null>(cfg.seeds || null);
  const seeds = Math.min(n, seedsOverride ?? defaultSeeds);
  const [rng, setRng] = useState(() => ev.drawSeed ?? Math.floor(Math.random() * 1e9));

  const draft: TEvent = { ...ev, mode, config: { ...cfg, seeds } };
  const plan = useMemo(() => {
    if (n < 2) return null;
    return generateDraw({
      event: draft,
      entryIds: order,
      seeds,
      rngSeed: rng,
      clubOf: (id) => {
        const clubs = new Set(lk.playersOfEntry(id).map((p) => p.club));
        return clubs.size === 1 ? [...clubs][0] : undefined;
      },
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

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(380px,440px)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <FormatStep
          mode={mode}
          onChange={(m) => {
            setMode(m);
            setSeedsOverride(null);
          }}
        />
        <OptionsStep mode={mode} cfg={cfg} onCfgChange={setCfg} n={n} seeds={seeds} onSeedsChange={setSeedsOverride} />
        <SeedingStep lk={lk} order={order} onOrderChange={setOrder} seeds={seeds} pairing={cfg.pairing} levelOf={strength} />
      </div>

      <PreviewStep
        draft={draft}
        n={n}
        warnings={plan?.warnings ?? []}
        preview={preview}
        drawKey={`${mode}-${rng}-${JSON.stringify(cfg)}-${seeds}-${order.join()}`}
        levelOf={strength}
        onShuffle={() => setRng(Math.floor(Math.random() * 1e9))}
        onPublish={doPublish}
      />
    </div>
  );
}
