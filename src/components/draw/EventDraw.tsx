import { useMemo, useState } from 'react';

import type { FlightLabel, Match, Stage, TEvent } from '@/engine/types';

import { cn } from '@/lib/cn';

import type { Lookup } from '@/data/lookup';

import { Bracket } from '@/components/draw/Bracket';
import { GroupCard } from '@/components/draw/Groups';
import { FlightBadge } from '@/components/tournament/Badges';
import { Empty } from '@/components/ui/Empty';
import { HelpTip } from '@/components/ui/HelpTip';
import { Icon } from '@/components/ui/Icon';

const FROM: Record<string, Record<FlightLabel, string>> = {
  ABCD: { A: 'Everyone starts here', B: 'Lost in A round 2', C: 'Lost in A round 1', D: 'Lost in C round 1' },
  AB: { A: 'Everyone starts here', B: 'Lost in A round 1', C: '', D: '' },
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
  const variant = stages.some((s) => s.flight === 'C') ? 'ABCD' : 'AB';
  const [sel, setSel] = useState<FlightLabel>(() => {
    if (highlight) {
      for (const f of ['D', 'C', 'B', 'A'] as FlightLabel[]) {
        const s = stages.find((x) => x.flight === f);
        if (s && (byStage.get(s.id) ?? []).some((m) => [m.a, m.b].some((e) => lk.entry(e)?.playerIds.includes(highlight)))) return f;
      }
    }
    return 'A';
  });
  const stage = stages.find((s) => s.flight === sel) ?? stages[0];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Flights" className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {stages.map((s) => {
            const ms = (byStage.get(s.id) ?? []).filter((m) => m.status !== 'bye');
            const done = ms.filter((m) => m.status === 'finished').length;
            const live = ms.filter((m) => m.status === 'on_court').length;
            const final = (byStage.get(s.id) ?? []).find((m) => m.round === s.rounds);
            const champ = final?.status === 'finished' && final.winner ? final[final.winner] : null;
            const on = s.flight === sel;
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={on}
                onClick={() => setSel(s.flight!)}
                title={FROM[variant][s.flight!]}
                className={cn(
                  'flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors touch:min-h-11',
                  on ? 'border-fg bg-fg text-bg' : 'border-line bg-surface hover:border-fg/50',
                )}
              >
                <FlightBadge flight={s.flight!} size="sm" />
                Flight {s.flight}
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
          {FROM[variant][sel]}
          <HelpTip label="How drop flights work">
            {variant === 'ABCD'
              ? 'Everyone starts in Flight A. Lose in A round 1 → Flight C. Lose in A round 2 → Flight B. Lose in C round 1 → Flight D. Every flight crowns its own champion.'
              : 'Everyone starts in Flight A. Lose in A round 1 and you drop to Flight B, so everyone plays at least twice.'}
          </HelpTip>
        </span>
      </div>
      <Bracket key={stage.id} lk={lk} stage={stage} matches={byStage.get(stage.id) ?? []} highlight={highlight} onOpen={onOpen} />
    </div>
  );
}
