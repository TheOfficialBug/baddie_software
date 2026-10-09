import { useMemo, useState } from 'react';

import type { FlightLabel, Match, Stage, TEvent } from '@/engine/types';

import { cn } from '@/lib/cn';

import type { Lookup } from '@/data/lookup';

import { Bracket } from '@/components/draw/Bracket';
import { GroupCard } from '@/components/draw/Groups';
import { FlightBadge, Pill } from '@/components/tournament/Badges';
import { Empty } from '@/components/ui/Empty';
import { Icon } from '@/components/ui/Icon';
import { ProgressBar } from '@/components/ui/ProgressBar';

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
      <div className="flex flex-col gap-8">
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
    <div className="flex flex-col gap-8">
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
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-2xl bg-sunken p-4 text-[14px] text-muted">
        <Icon name="info" size={20} className="mt-0.5 text-fg" />
        <p>
          <span className="font-semibold text-fg">How drop flights work: </span>
          {variant === 'ABCD'
            ? 'everyone starts in Flight A. Lose in A round 1 → Flight C. Lose in A round 2 → Flight B. Lose in C round 1 → Flight D. Every flight crowns its own champion.'
            : 'everyone starts in Flight A. Lose in A round 1 and you drop to Flight B, so everyone plays at least twice.'}
        </p>
      </div>
      <div
        role="tablist"
        aria-label="Flights"
        className={cn('grid gap-2.5', variant === 'ABCD' ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2')}
      >
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
              className={cn(
                'flex min-h-[88px] min-w-0 flex-col gap-2 rounded-2xl border-[1.5px] bg-surface p-3.5 text-left transition-colors sm:p-4',
                on ? 'border-fg' : 'border-line hover:border-fg/40',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <FlightBadge flight={s.flight!} size="sm" />
                  <strong className="font-display text-[18px] sm:text-[20px]">Flight {s.flight}</strong>
                </span>
                {champ ? (
                  <Pill tone="ok">Done</Pill>
                ) : live > 0 ? (
                  <Pill tone="live">{live} live</Pill>
                ) : (
                  <Pill tone="muted">
                    {done}/{ms.length}
                  </Pill>
                )}
              </span>
              <span className="text-[12.5px] text-muted">{FROM[variant][s.flight!]}</span>
              {champ ? (
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
                  <Icon name="trophy" size={15} />
                  <span className="truncate">{lk.entryName(champ)}</span>
                </span>
              ) : (
                <ProgressBar value={done} max={ms.length} className="h-1.5" tone="ink" />
              )}
            </button>
          );
        })}
      </div>
      <Bracket key={stage.id} lk={lk} stage={stage} matches={byStage.get(stage.id) ?? []} highlight={highlight} onOpen={onOpen} />
    </div>
  );
}
