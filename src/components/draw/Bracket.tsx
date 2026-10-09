import { useMemo, useState } from 'react';

import { roundName } from '@/engine/draws';
import type { Match, Stage } from '@/engine/types';

import type { Lookup } from '@/data/lookup';

import { BracketMatch } from '@/components/match/Match';
import { FlightBadge } from '@/components/tournament/Badges';
import { FLIGHT_TEXT } from '@/components/tournament/labels';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Tabs';

const SLOT = 92; // px per first-round match in the tree

/**
 * Knockout bracket.
 * Phones and small tablets: one round at a time with a round picker (no sideways scrolling).
 * Tablets landscape and up: the full tree with connector lines, scrolling inside its own card.
 */
export function Bracket({
  lk,
  stage,
  matches,
  highlight,
  onOpen,
  title,
}: {
  lk: Lookup;
  stage: Stage;
  matches: Match[];
  highlight?: string | null;
  onOpen?: (m: Match) => void;
  title?: boolean;
}) {
  const rounds = useMemo(() => {
    const out: Match[][] = [];
    for (let r = 1; r <= stage.rounds; r++) out.push(matches.filter((m) => m.round === r).sort((a, b) => a.index - b.index));
    return out;
  }, [matches, stage.rounds]);
  const final = rounds[rounds.length - 1]?.[0];
  const champion = final && (final.status === 'finished' || final.status === 'bye') && final.winner ? final[final.winner] : null;
  const [mobileRound, setMobileRound] = useState(() => {
    const firstOpen = rounds.findIndex((r) => r.some((m) => m.status !== 'finished' && m.status !== 'bye'));
    return String(firstOpen < 0 ? rounds.length - 1 : firstOpen);
  });
  const h = Math.max(1, rounds[0]?.length ?? 1) * SLOT;

  return (
    <section className="min-w-0" aria-label={stage.name}>
      {title && (
        <div className="mb-3 flex items-center gap-2.5">
          {stage.flight && <FlightBadge flight={stage.flight} />}
          <h3 className="font-display text-[20px] font-bold">{stage.name}</h3>
          <span className="text-[13px] text-muted">{stage.size}-draw</span>
        </div>
      )}

      {champion && champion !== 'BYE' && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-hero p-4 text-hero-fg">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-fg">
            <Icon name="trophy" size={22} />
          </span>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-hero-muted">
              {stage.flight
                ? `${stage.flight} flight champion`
                : stage.name === '3rd place'
                  ? 'Third place'
                  : stage.name === 'Plate'
                    ? 'Plate winner'
                    : 'Champion'}
            </div>
            <div className="truncate font-display text-[20px] font-bold">{lk.entryName(champion)}</div>
          </div>
        </div>
      )}

      {/* Phones / small tablets: one round at a time */}
      <div className="lg:hidden">
        {rounds.length > 1 && (
          <Segmented
            label="Round"
            size="sm"
            className="mb-3"
            value={mobileRound}
            onChange={setMobileRound}
            options={rounds.map((ms, i) => ({
              value: String(i),
              label: roundName(stage, i + 1, true),
              count: ms.filter((m) => m.status !== 'bye').length,
            }))}
          />
        )}
        <div className="grid gap-2.5 sm:grid-cols-2">
          {(rounds[Number(mobileRound)] ?? [])
            .filter((m) => m.status !== 'bye')
            .map((m) => (
              <BracketMatch key={m.id} lk={lk} m={m} highlight={highlight} onOpen={onOpen} />
            ))}
        </div>
        {(() => {
          const byes = (rounds[Number(mobileRound)] ?? []).filter((m) => m.status === 'bye').length;
          return byes ? (
            <p className="mt-3 text-[13px] text-muted">
              {byes} {byes === 1 ? 'player has' : 'players have'} a bye this round and go straight through.
            </p>
          ) : null;
        })()}
      </div>

      {/* Laptop and up: the full tree */}
      <div className="panel scroll-thin hidden overflow-x-auto p-5 lg:block">
        <div className="flex min-w-max gap-7 pr-2">
          {rounds.map((ms, ri) => {
            const pairs: Match[][] = [];
            for (let i = 0; i < ms.length; i += 2) pairs.push(ms.slice(i, i + 2));
            const last = ri === rounds.length - 1;
            const done = ms.filter((m) => m.status === 'finished').length;
            const real = ms.filter((m) => m.status !== 'bye').length;
            return (
              <div key={ri} className="flex w-[220px] shrink-0 flex-col">
                <div className="mb-3 flex h-5 items-baseline justify-between">
                  <span className="eyebrow text-fg">{roundName(stage, ri + 1)}</span>
                  <span className="num text-[11px] text-muted">
                    {done}/{real}
                  </span>
                </div>
                <div className="flex flex-col" style={{ height: h }}>
                  {pairs.map((pair, pi) => (
                    <div key={pi} className="relative flex flex-1 flex-col">
                      {pair.map((m) => (
                        <div key={m.id} className="relative flex flex-1 items-center py-1">
                          {ri > 0 && <span className="absolute -left-3.5 top-1/2 h-px w-3.5 bg-line-strong" />}
                          {!last && <span className="absolute -right-3.5 top-1/2 h-px w-3.5 bg-line-strong" />}
                          <BracketMatch lk={lk} m={m} highlight={highlight} onOpen={onOpen} />
                        </div>
                      ))}
                      {!last && pair.length === 2 && <span className="absolute -right-3.5 bottom-1/4 top-1/4 w-px bg-line-strong" />}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {champion && champion !== 'BYE' && (
            <div className="flex w-[180px] shrink-0 flex-col">
              <div className="eyebrow mb-3 h-5 text-fg">Winner</div>
              <div className="flex items-center" style={{ height: h }}>
                <div className="flex w-full items-center gap-2 rounded-xl bg-primary px-3 py-3 font-semibold text-primary-fg">
                  <Icon name="trophy" size={18} />
                  <span className="truncate">{lk.entryName(champion)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <span className="hidden">{stage.flight ? FLIGHT_TEXT[stage.flight] : ''}</span>
    </section>
  );
}
