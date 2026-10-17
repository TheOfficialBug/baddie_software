import { useMemo, useState } from 'react';

import type { Match, Stage, TEvent } from '@/engine/types';

import { cn } from '@/lib/cn';

import type { Lookup } from '@/data/lookup';

import { Bracket } from '@/components/draw/Bracket';
import { GroupCard } from '@/components/draw/Groups';
import { PlacementTree } from '@/components/draw/PlacementTree';
import { FlightBadge } from '@/components/tournament/Badges';
import { Empty } from '@/components/ui/Empty';
import { HelpTip } from '@/components/ui/HelpTip';
import { Icon } from '@/components/ui/Icon';

/** Where each tab's players come from, per drop flight variant (keyed by flight, or by stage name). */
const FROM: Record<string, Record<string, string>> = {
  ABCD: { A: 'Everyone starts here', B: 'Won, then lost in A', C: 'Lost their first match in A', D: 'Lost their first match in C' },
  AB: { A: 'Everyone starts here', B: 'Lost in A round 1' },
  PLACEMENT: {
    A: 'Won round 2 upper',
    B: 'Lost round 2 upper',
    C: 'Won round 2 lower',
    D: 'Lost round 2 lower',
  },
};
const HOW: Record<string, string> = {
  ABCD: 'Everyone starts in Flight A. Your first two matches decide your flight: win, win → stay in A · win, lose → Flight B · lose, win → Flight C · lose, lose → Flight D. With a round-1 bye your first match is in round 2. The draw is arranged so players finish in the flight of their level. Every flight crowns its own champion.',
  AB: 'Everyone starts in Flight A. Lose in A round 1 and you drop to Flight B, so everyone plays at least twice.',
  PLACEMENT:
    'Two placement rounds sort everyone into a flight by results. Round 1: the top half of the field plays the bottom half; winners go to the upper group, losers to the lower group. Round 2: each group plays again; upper winners → Flight A, upper losers → Flight B, lower winners → Flight C, lower losers → Flight D. Each flight is then a knockout with its own champion. The draw is fixed when published.',
};

export function EventDraw({
  lk,
  ev,
  highlight,
  onOpen,
}: {
  lk: Lookup;
  ev: TEvent;
  highlight?: string | null;
  onOpen?: (m: Match) => void;
}) {
  const stages = lk.stagesOf(ev.id);
  const matches = lk.matchesOfEvent(ev.id);
  const byStage = useMemo(() => {
    const m = new Map<string, Match[]>();
    matches.forEach((x) => m.set(x.stageId, [...(m.get(x.stageId) ?? []), x]));
    return m;
  }, [matches]);

  if (!stages.length)
    return (
      <Empty
        icon="draws"
        title="The draw isn't out yet"
        body="Draws are published after registration closes. You'll get a notification when it's ready."
      />
    );

  if (ev.mode === 'drop_flight') return <DropFlight lk={lk} stages={stages} byStage={byStage} highlight={highlight} onOpen={onOpen} />;

  if (ev.mode === 'round_robin') {
    const gs = stages.find((s) => s.kind === 'group')!;
    const ko = stages.find((s) => s.kind === 'knockout');
    const groups = lk.groupsOf(gs.id);
    return (
      <div className="flex flex-col gap-6">
        <div className={cn('grid gap-5', groups.length > 1 && 'xl:grid-cols-2')}>
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              lk={lk}
              group={g}
              matches={(byStage.get(gs.id) ?? []).filter((m) => m.groupId === g.id)}
              advance={ev.config.advance}
              highlight={highlight}
              onOpen={onOpen}
            />
          ))}
        </div>
        {ko && (
          <div>
            <h3 className="mb-3 font-display text-[22px] font-extrabold">Knockout stage</h3>
            <Bracket lk={lk} stage={ko} matches={byStage.get(ko.id) ?? []} highlight={highlight} onOpen={onOpen} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {stages.map((s) => (
        <Bracket
          key={s.id}
          lk={lk}
          stage={s}
          matches={byStage.get(s.id) ?? []}
          highlight={highlight}
          onOpen={onOpen}
          title={stages.length > 1}
        />
      ))}
    </div>
  );
}

function DropFlight({
  lk,
  stages,
  byStage,
  highlight,
  onOpen,
}: {
  lk: Lookup;
  stages: Stage[];
  byStage: Map<string, Match[]>;
  highlight?: string | null;
  onOpen?: (m: Match) => void;
}) {
  const variant = stages.some((s) => s.placement) ? 'PLACEMENT' : stages.some((s) => s.flight === 'C') ? 'ABCD' : 'AB';
  // One tab per flight; the placement rounds share one tab, drawn as a tree.
  const placement = stages.filter((s) => s.placement);
  const tabs: { id: string; label: string; from: string; stages: Stage[]; flight?: Stage['flight'] }[] = [
    ...(placement.length ? [{ id: 'placement', label: 'Placement', from: 'Round 1 → round 2 → flights', stages: placement }] : []),
    ...stages
      .filter((s) => !s.placement)
      .map((s) => ({
        id: s.id,
        label: s.flight ? `Flight ${s.flight}` : s.name,
        from: FROM[variant][s.flight ?? s.name] ?? '',
        stages: [s],
        flight: s.flight,
      })),
  ];
  const [sel, setSel] = useState<string>(() => {
    if (highlight) {
      // the latest tab the followed player is in
      for (const t of [...tabs].reverse()) {
        if (t.stages.some((s) => (byStage.get(s.id) ?? []).some((m) => [m.a, m.b].some((e) => lk.entry(e)?.playerIds.includes(highlight)))))
          return t.id;
      }
    }
    return tabs[0].id;
  });
  const tab = tabs.find((t) => t.id === sel) ?? tabs[0];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Flights" className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {tabs.map((t) => {
            // matches that get played (not byes, including "winner of #12 v bye" before it resolves)
            const ms = t.stages
              .flatMap((s) => byStage.get(s.id) ?? [])
              .filter((m) => m.status !== 'bye' && m.srcA.kind !== 'bye' && m.srcB.kind !== 'bye');
            const done = ms.filter((m) => m.status === 'finished').length;
            const live = ms.filter((m) => m.status === 'on_court').length;
            const only = t.flight ? t.stages[0] : undefined;
            const final = only && (byStage.get(only.id) ?? []).find((m) => m.round === only.rounds);
            const champ = final?.status === 'finished' && final.winner ? final[final.winner] : null;
            const on = t.id === tab.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                onClick={() => setSel(t.id)}
                title={t.from}
                className={cn(
                  'flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors touch:min-h-11',
                  on ? 'border-fg bg-fg text-bg' : 'border-line bg-surface hover:border-fg/50',
                )}
              >
                {t.flight && <FlightBadge flight={t.flight} size="sm" />}
                {t.label}
                {champ ? (
                  <Icon name="trophy" size={14} />
                ) : live > 0 ? (
                  <span className="num text-[11.5px] text-live">{live} live</span>
                ) : (
                  <span className={cn('num text-[11.5px]', on ? 'opacity-70' : 'text-muted')}>
                    {done}/{ms.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <span className="flex items-center gap-1 text-[12.5px] text-muted">
          {tab.from}
          <HelpTip label="How drop flights work">{HOW[variant]}</HelpTip>
        </span>
      </div>
      {tab.id === 'placement' ? (
        <PlacementTree
          lk={lk}
          stages={tab.stages}
          flights={stages.filter((s) => s.flight)}
          byStage={byStage}
          highlight={highlight}
          onOpen={onOpen}
        />
      ) : (
        <Bracket
          key={tab.id}
          lk={lk}
          stage={tab.stages[0]}
          matches={byStage.get(tab.stages[0].id) ?? []}
          highlight={highlight}
          onOpen={onOpen}
        />
      )}
    </div>
  );
}
