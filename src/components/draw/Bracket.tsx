import { type ReactNode, useMemo } from 'react';

import { roundName } from '@/engine/draws';
import type { Match, Stage } from '@/engine/types';

import { usePersistentState } from '@/hooks/usePersistentState';
import { cn } from '@/lib/cn';

import { realClub } from '@/data/clubs';
import type { Lookup } from '@/data/lookup';

import { DrawCanvas } from '@/components/draw/DrawCanvas';
import { useShowLevels } from '@/components/draw/showLevels';
import { BracketMatch } from '@/components/match/Match';
import { FlightBadge } from '@/components/tournament/Badges';
import { Icon } from '@/components/ui/Icon';

const SLOT = 68; // px per first-round match in the tree (two 28px rows + gap)
const GAP = 20; // between round columns (gap-5)

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
  // first-round byes are drawn ("Player vs Bye"), except a pair of byes (a round-2 bye) outside the editor;
  // later rounds only hide matches that never happen
  const isHidden = (m: Match, round: number) => (round === 0 ? !editLine && m.srcA.kind === 'bye' && m.srcB.kind === 'bye' : hidden(m));
  // Tree layout: drawn first-round matches stack with no gaps; every later match sits midway between the
  // drawn matches its players come from (through any round they skip with a bye).
  const layout = useMemo(() => {
    const byId = new Map(matches.map((m) => [m.id, m]));
    const shown = new Set(rounds.flatMap((ms, ri) => ms.filter((m) => !isHidden(m, ri)).map((m) => m.id)));
    const origins = (m: Match): string[] =>
      [m.srcA, m.srcB].flatMap((src) => {
        const f = src.kind === 'winner' ? byId.get(src.matchId) : undefined;
        return !f ? [] : shown.has(f.id) ? [f.id] : origins(f);
      });
    const y = new Map<string, number>();
    const from = new Map<string, string[]>();
    let leaves = 0;
    for (const ms of rounds)
      for (const m of ms) {
        if (!shown.has(m.id)) continue;
        const o = origins(m).filter((id) => y.has(id));
        from.set(m.id, o);
        y.set(m.id, o.length ? o.reduce((sum, id) => sum + y.get(id)!, 0) / o.length : (leaves++ + 0.5) * SLOT);
      }
    return { y, from, height: Math.max(1, leaves) * SLOT };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, editLine]);
  const h = layout.height;
  // Columns as wide as the longest name in this draw (doubles pairs too), so names show in full:
  // ~6.5px a character at 12.5px, plus the number gutter, a seed tag and up to three game scores.
  const longest = Math.max(12, ...matches.flatMap((m) => [m.a, m.b]).map((e) => (e && e !== 'BYE' ? lk.entryName(e).length : 14)));
  const levelTag = useShowLevels() ? 34 : 0; // "B/C" on organizer pages
  const colWidth = Math.min(420, Math.max(180, Math.round(longest * 6.5 + 32 + 26 + 56 + levelTag)));

  // Clubs: an optional column left of round 1, one line per player (remembered on this device)
  const [showClubs, setShowClubs] = usePersistentState<boolean>('draw.clubs', false);
  const clubOf = (e: Match['a']) =>
    e && e !== 'BYE' ? [...new Set(lk.playersOfEntry(e).flatMap((p) => realClub(p.club) ?? []))].join(' / ') : '';
  const firstRound = (rounds[0] ?? []).filter((m) => layout.y.has(m.id));
  const longestClub = Math.max(4, ...firstRound.flatMap((m) => [m.a, m.b]).map((e) => clubOf(e).length));
  const clubWidth = showClubs ? Math.min(220, Math.max(90, Math.round(longestClub * 6 + 16))) : 0;
  // where round columns start (after the club column)
  const x0 = showClubs ? clubWidth + GAP : 0;

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

      <DrawCanvas
        label={`${stage.name} bracket`}
        toolbar={toolbar}
        controls={
          <button
            type="button"
            aria-pressed={showClubs}
            onClick={() => setShowClubs(!showClubs)}
            title={showClubs ? 'Hide clubs' : "Show each player's club"}
            className={cn(
              'min-h-8 rounded-full px-2.5 text-[12px] font-semibold touch:min-h-10',
              showClubs ? 'bg-fg text-bg' : 'text-muted hover:bg-sunken hover:text-fg',
            )}
          >
            Clubs
          </button>
        }
      >
        <div className="relative flex gap-5 pr-2">
          {/* connectors: from each match to the next match its winner plays, an elbow in the gap before it */}
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={h} aria-hidden>
            {rounds.flatMap((ms, ri) =>
              ms.flatMap((m) =>
                (layout.from.get(m.id) ?? []).map((o) => {
                  const src = matches.find((x) => x.id === o)!;
                  const x1 = x0 + (src.round - 1) * (colWidth + GAP) + colWidth;
                  const x2 = x0 + ri * (colWidth + GAP);
                  const xm = x2 - GAP / 2;
                  return (
                    <path
                      key={`${o}>${m.id}`}
                      d={`M${x1} ${layout.y.get(o)} H${xm} V${layout.y.get(m.id)} H${x2}`}
                      className="fill-none stroke-line-strong"
                      strokeWidth={1}
                    />
                  );
                }),
              ),
            )}
          </svg>
          {showClubs && (
            <div className="flex shrink-0 flex-col" style={{ width: clubWidth }} aria-label="Clubs">
              <div className="sticky top-0 z-[1] -mt-10 mb-2 flex h-8 items-center justify-end rounded-md bg-surface/95 px-1 backdrop-blur">
                <span className="eyebrow text-muted">Club</span>
              </div>
              <div className="relative" style={{ height: h }}>
                {firstRound.map((m) => (
                  <div
                    key={m.id}
                    className="absolute inset-x-0 flex flex-col justify-center text-right text-[11.5px] text-muted"
                    style={{ top: layout.y.get(m.id)! - SLOT / 2, height: SLOT }}
                  >
                    {(['a', 'b'] as const).map((side) => (
                      <span key={side} className="truncate leading-7" title={clubOf(m[side])}>
                        {clubOf(m[side]) || '\u00a0'}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          {rounds.map((ms, ri) => {
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
                <div className="relative" style={{ height: h }}>
                  {ms.map((m) => {
                    const y = layout.y.get(m.id);
                    if (y === undefined) return null;
                    return (
                      <div key={m.id} className="absolute inset-x-0 flex items-center py-1" style={{ top: y - SLOT / 2, height: SLOT }}>
                        {editLine && ri === 0 ? editLine(m) : <BracketMatch lk={lk} m={m} highlight={highlight} onOpen={onOpen} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {champion && champion !== 'BYE' && final && (
            <div className="flex w-[170px] shrink-0 flex-col">
              <div className="sticky top-0 z-[1] -mt-10 mb-2 flex h-8 items-center px-1">
                <span className="eyebrow text-fg">Winner</span>
              </div>
              <div className="relative" style={{ height: h }}>
                <div
                  className="absolute inset-x-0 flex items-center gap-2 rounded-md bg-primary px-2.5 py-1.5 text-[13px] font-semibold text-primary-fg"
                  style={{ top: (layout.y.get(final.id) ?? h / 2) - 16 }}
                >
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
