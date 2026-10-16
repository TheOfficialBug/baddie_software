import type { Match, Side, Stage } from '@/engine/types';

import type { Lookup } from '@/data/lookup';

import { DrawCanvas } from '@/components/draw/DrawCanvas';
import { useShowLevels } from '@/components/draw/showLevels';
import { BracketMatch } from '@/components/match/Match';
import { sideName } from '@/components/match/matchInfo';
import { FlightBadge, LevelTag } from '@/components/tournament/Badges';

/**
 * The two placement rounds of a "By results" drop flight, left to right: round 1, then round 2
 * upper (round-1 winners) and lower (round-1 losers), each with the best-ranked players who skip
 * round 2 (a bye straight into Flight A or C), and where round-2 winners and losers go next.
 */
export function PlacementTree({
  lk,
  stages,
  flights,
  byStage,
  highlight,
  onOpen,
}: {
  lk: Lookup;
  /** Round 1, Round 2 upper, Round 2 lower (placement stages, in order). */
  stages: Stage[];
  /** The flight stages, to show who goes straight into Flight A or C. */
  flights: Stage[];
  byStage: Map<string, Match[]>;
  highlight?: string | null;
  onOpen?: (m: Match) => void;
}) {
  const [r1Stage, upStage, lowStage] = stages;
  const sorted = (st?: Stage) => [...(st ? (byStage.get(st.id) ?? []) : [])].sort((a, b) => a.index - b.index);
  const r1 = sorted(r1Stage);
  const r1Ids = new Set(r1.map((m) => m.id));
  const levels = useShowLevels();
  const longest = Math.max(12, ...r1.flatMap((m) => [m.a, m.b]).map((e) => (e && e !== 'BYE' ? lk.entryName(e).length : 6)));
  const cardW = Math.min(380, Math.max(200, Math.round(longest * 6.5 + 32 + 26 + 56 + (levels ? 34 : 0))));

  /** Flight slots fed straight from round 1: players who skip round 2. */
  const straightInto = (label: 'A' | 'C') => {
    const st = flights.find((f) => f.flight === label);
    if (!st) return [];
    return (byStage.get(st.id) ?? [])
      .filter((m) => m.round === 1)
      .flatMap((m) =>
        (['a', 'b'] as Side[]).flatMap((side) => {
          const src = side === 'a' ? m.srcA : m.srcB;
          return (src.kind === 'winner' || src.kind === 'loser') && r1Ids.has(src.matchId) ? [{ m, side }] : [];
        }),
      );
  };

  const match = (m: Match) => (
    <div key={m.id} style={{ width: cardW }}>
      <BracketMatch lk={lk} m={m} highlight={highlight} onOpen={onOpen} />
    </div>
  );
  const goes = (win: 'A' | 'C', lose: 'B' | 'D') => (
    <p className="flex flex-wrap items-center gap-1 text-[11.5px] text-muted">
      Winners <FlightBadge flight={win} size="sm" /> · losers <FlightBadge flight={lose} size="sm" />
    </p>
  );
  const group = (title: string, st: Stage | undefined, win: 'A' | 'C', lose: 'B' | 'D') => {
    const ms = sorted(st);
    const skip = straightInto(win);
    return (
      <section className="flex flex-col gap-2" aria-label={title}>
        <div className="flex items-baseline justify-between gap-3" style={{ width: cardW }}>
          <h4 className="eyebrow text-fg">{title}</h4>
          {goes(win, lose)}
        </div>
        {ms.map(match)}
        {skip.length > 0 && (
          <div className="flex flex-col gap-1 rounded-md border border-dashed border-line-strong/70 p-2" style={{ width: cardW }}>
            <span className="flex items-center gap-1 text-[11.5px] font-semibold text-muted">
              Bye: straight into <FlightBadge flight={win} size="sm" />
            </span>
            {skip.map(({ m, side }) => {
              const slot = m[side];
              return (
                <span key={`${m.id}-${side}`} className="flex items-center text-[12.5px]">
                  <span className="min-w-0 flex-1 truncate">{sideName(lk, m, side)}</span>
                  {levels && slot && slot !== 'BYE' && <LevelTag levels={lk.entryLevels(slot)} />}
                </span>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <DrawCanvas label="Placement rounds">
      <div className="flex items-start gap-8 pr-2">
        <section className="flex flex-col gap-2" aria-label="Round 1">
          <div className="flex items-baseline justify-between gap-3" style={{ width: cardW }}>
            <h4 className="eyebrow text-fg">Round 1</h4>
            <p className="text-[11.5px] text-muted">Winners → upper · losers → lower</p>
          </div>
          {r1.map(match)}
        </section>
        <div className="flex flex-col gap-6">
          {group('Round 2 upper', upStage, 'A', 'B')}
          {group('Round 2 lower', lowStage, 'C', 'D')}
        </div>
      </div>
    </DrawCanvas>
  );
}
