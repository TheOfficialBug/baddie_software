import { type ReactNode, useMemo } from 'react';

import { roundName } from '@/engine/draws';
import type { Match, Stage } from '@/engine/types';

import { cn } from '@/lib/cn';

import type { Lookup } from '@/data/lookup';

import { DrawCanvas } from '@/components/draw/DrawCanvas';
import { useShowLevels } from '@/components/draw/showLevels';
import { BracketMatch } from '@/components/match/Match';
import { FlightBadge } from '@/components/tournament/Badges';
import { Icon } from '@/components/ui/Icon';

const SLOT = 68; // px per first-round match in the tree (two 28px rows + gap)

/** Matches that never get played (a bye). Not counted as matches, but still drawn so everyone starts on the left. */
const hidden = (m: Match) => m.status === 'bye' || m.srcA.kind === 'bye' || m.srcB.kind === 'bye';

/**
 * Knockout bracket as a canvas (Challonge-style): every round side by side with connector lines,
 * scrollable both ways on any screen, zoomable, round names pinned while scrolling down.
 * Every first-round line is drawn, byes too, so each player starts in the left column in draw order.
 * With `editLine`, the first-round lines are drawn by the caller: the draw editor.
 */
export function Bracket({
  lk,
  stage,
  matches,
  highlight,
  onOpen,
  title,
  editLine,
  toolbar,
}: {
  lk: Lookup;
  stage: Stage;
  matches: Match[];
  highlight?: string | null;
  onOpen?: (m: Match) => void;
  title?: boolean;
  /** Draw the first-round lines yourself (placement editing); byes are shown so they can be filled. */
  editLine?: (m: Match) => ReactNode;
  /** Shown above the draw inside the canvas (and in full screen), e.g. the editor's actions. */
  toolbar?: ReactNode;
}) {
  const rounds = useMemo(() => {
    const out: Match[][] = [];
    for (let r = 1; r <= stage.rounds; r++) out.push(matches.filter((m) => m.round === r).sort((a, b) => a.index - b.index));
    return out;
  }, [matches, stage.rounds]);
  const final = rounds[rounds.length - 1]?.[0];
  const champion =
    !stage.placement && final && (final.status === 'finished' || final.status === 'bye') && final.winner ? final[final.winner] : null;
  const h = Math.max(1, rounds[0]?.length ?? 1) * SLOT;
  // first-round byes are drawn ("Player vs Bye"); later rounds only hide matches that never happen
  const isHidden = (m: Match, round: number) => (round === 0 ? false : hidden(m));
  // Columns as wide as the longest name in this draw (doubles pairs too), so names show in full:
  // ~6.5px a character at 12.5px, plus the number gutter, a seed tag and up to three game scores.
  const longest = Math.max(12, ...matches.flatMap((m) => [m.a, m.b]).map((e) => (e && e !== 'BYE' ? lk.entryName(e).length : 14)));
  const levelTag = useShowLevels() ? 34 : 0; // "B/C" on organizer pages
  const colWidth = Math.min(420, Math.max(180, Math.round(longest * 6.5 + 32 + 26 + 56 + levelTag)));

  return (
    <section className="min-w-0" aria-label={stage.name}>
      {title && (
        <div className="mb-2 flex items-center gap-2">
          {stage.flight && <FlightBadge flight={stage.flight} />}
          <h3 className="font-display text-[17px] font-bold">{stage.name}</h3>
          <span className="text-[12.5px] text-muted">{stage.size}-draw</span>
        </div>
      )}

      {champion && champion !== 'BYE' && (
        <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-hero px-3 py-2 text-hero-fg">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-fg">
            <Icon name="trophy" size={16} />
          </span>
          <span className="text-[11.5px] font-semibold uppercase tracking-wider text-hero-muted">
            {stage.flight
              ? `${stage.flight} flight champion`
              : stage.name === '3rd place'
                ? 'Third place'
                : stage.name === 'Plate'
                  ? 'Plate winner'
                  : 'Champion'}
          </span>
          <span className="min-w-0 truncate font-display text-[16px] font-bold">{lk.entryName(champion)}</span>
        </div>
      )}

      <DrawCanvas label={`${stage.name} bracket`} toolbar={toolbar}>
        <div className="flex gap-5 pr-2">
          {rounds.map((ms, ri) => {
            const pairs: Match[][] = [];
            for (let i = 0; i < ms.length; i += 2) pairs.push(ms.slice(i, i + 2));
            const last = ri === rounds.length - 1;
            const done = ms.filter((m) => m.status === 'finished').length;
            const real = ms.filter((m) => !hidden(m)).length;
            return (
              <div key={ri} className="flex shrink-0 flex-col" style={{ width: colWidth }}>
                <div className="sticky top-0 z-[1] -mt-10 mb-2 flex h-8 items-center justify-between rounded-md bg-surface/95 px-1 backdrop-blur">
                  <span className="eyebrow text-fg">{roundName(stage, ri + 1)}</span>
                  <span className="num text-[11px] text-muted">
                    {done}/{real}
                  </span>
                </div>
                <div className="flex flex-col" style={{ height: h }}>
                  {pairs.map((pair, pi) => {
                    const [top, bottom] = pair.map((m) => !isHidden(m, ri));
                    // vertical joiner between the pair's two stubs (only from matches that are drawn)
                    const bar =
                      pair.length === 2 && (top || bottom)
                        ? top && bottom
                          ? 'top-1/4 bottom-1/4'
                          : top
                            ? 'top-1/4 bottom-1/2'
                            : 'top-1/2 bottom-1/4'
                        : null;
                    return (
                      <div key={pi} className="relative flex flex-1 flex-col">
                        {pair.map((m) => (
                          <div key={m.id} className="relative flex flex-1 items-center py-1">
                            {isHidden(m, ri) ? null : (
                              <>
                                {ri > 0 && <span className="absolute -left-3.5 top-1/2 h-px w-3.5 bg-line-strong" />}
                                {!last && <span className="absolute -right-3.5 top-1/2 h-px w-3.5 bg-line-strong" />}
                                {editLine && ri === 0 ? editLine(m) : <BracketMatch lk={lk} m={m} highlight={highlight} onOpen={onOpen} />}
                              </>
                            )}
                          </div>
                        ))}
                        {!last && bar && <span className={cn('absolute -right-3.5 w-px bg-line-strong', bar)} />}
                        {/* a round-1 pair of byes still feeds the next round */}
                        {!last && ri === 0 && !top && !bottom && <span className="absolute -right-3.5 top-1/2 h-px w-3.5 bg-line" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {champion && champion !== 'BYE' && (
            <div className="flex w-[170px] shrink-0 flex-col">
              <div className="sticky top-0 z-[1] -mt-10 mb-2 flex h-8 items-center px-1">
                <span className="eyebrow text-fg">Winner</span>
              </div>
              <div className="flex items-center" style={{ height: h }}>
                <div className="flex w-full items-center gap-2 rounded-md bg-primary px-2.5 py-1.5 text-[13px] font-semibold text-primary-fg">
                  <Icon name="trophy" size={15} />
                  <span className="truncate">{lk.entryName(champion)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </DrawCanvas>
    </section>
  );
}
