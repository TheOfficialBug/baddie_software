import { useMemo, useState } from 'react';

import { computeStandings, type StandingRow } from '@/engine/standings';
import type { Group, Match } from '@/engine/types';

import { cn } from '@/lib/cn';

import type { Lookup } from '@/data/lookup';

import { BracketMatch } from '@/components/match/Match';
import { Pill, SeedTag } from '@/components/tournament/Badges';
import { HelpTip } from '@/components/ui/HelpTip';
import { Segmented } from '@/components/ui/Tabs';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function GroupCard({
  lk,
  group,
  matches,
  advance,
  highlight,
  onOpen,
}: {
  lk: Lookup;
  group: Group;
  matches: Match[];
  advance: number;
  highlight?: string | null;
  onOpen?: (m: Match) => void;
}) {
  const rules = lk.groupRules(group.eventId);
  const st = useMemo(() => computeStandings(group.id, group.entryIds, matches, rules), [group, matches, rules]);
  const [view, setView] = useState<'table' | 'matches' | 'grid'>('table');
  const played = matches.filter((m) => m.status === 'finished').length;

  return (
    <section className="panel min-w-0 overflow-hidden" aria-label={group.name}>
      <header className="flex flex-wrap items-center gap-3 px-5 pb-3 pt-4">
        <h3 className="font-display text-[20px] font-bold">{group.name}</h3>
        <Pill tone={st.complete ? 'ok' : 'neutral'}>{st.complete ? 'Final standings' : `${played} of ${matches.length} played`}</Pill>
        <Segmented
          className="ml-auto"
          size="sm"
          label={`${group.name} view`}
          value={view}
          onChange={setView}
          options={[
            { value: 'table', label: 'Table' },
            { value: 'matches', label: 'Matches' },
            { value: 'grid', label: 'Grid' },
          ]}
        />
      </header>

      {view === 'table' && (
        <>
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-y border-line text-left text-[11.5px] font-semibold uppercase tracking-wider text-muted">
                <th scope="col" className="w-10 py-2.5 pl-5">
                  #
                </th>
                <th scope="col" className="py-2.5">
                  Player
                </th>
                <th scope="col" className="w-12 py-2.5 text-center" title="Matches won">
                  W
                </th>
                <th scope="col" className="w-12 py-2.5 text-center" title="Matches lost">
                  L
                </th>
                <th scope="col" className="hidden w-20 py-2.5 text-center xs:table-cell" title="Game difference">
                  Games ±
                </th>
                <th scope="col" className="hidden w-20 py-2.5 pr-5 text-center sm:table-cell" title="Point difference">
                  Points ±
                </th>
              </tr>
            </thead>
            <tbody>
              {st.rows.map((r) => (
                <Row key={r.entryId} lk={lk} r={r} q={advance > 0 && r.rank <= advance} complete={st.complete} highlight={highlight} />
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-5 py-3 text-[12.5px] text-muted">
            {advance > 0 && (
              <span className="flex items-center gap-1.5">
                <Pill tone="lime" className="min-h-5 px-1.5 text-[11px]">
                  Q
                </Pill>{' '}
                Top {advance} {st.complete ? 'qualify' : 'would qualify now'}
              </span>
            )}
            <span className="flex items-center gap-1">
              BWF ranking order
              <HelpTip label="How ties are broken">
                Matches won first. Two tied: head-to-head. Three or more tied: game difference, then point difference (head-to-head again if
                two are left), then a draw of lots.
              </HelpTip>
            </span>
          </div>
        </>
      )}

      {view === 'matches' && (
        <div className="grid gap-2.5 border-t border-line p-4 sm:grid-cols-2">
          {matches
            .slice()
            .sort((a, b) => a.number - b.number)
            .map((m) => (
              <BracketMatch key={m.id} lk={lk} m={m} highlight={highlight} onOpen={onOpen} />
            ))}
        </div>
      )}

      {view === 'grid' && <CrossTable lk={lk} group={group} matches={matches} />}
    </section>
  );
}

function Row({ lk, r, q, complete, highlight }: { lk: Lookup; r: StandingRow; q: boolean; complete: boolean; highlight?: string | null }) {
  const entry = lk.entry(r.entryId);
  const mine = !!highlight && entry?.playerIds.includes(highlight);
  return (
    <tr className={cn('border-t border-line/80 first:border-t-0', mine && 'bg-primary/20')}>
      <td className="num py-3 pl-5 font-semibold">{r.rank}</td>
      <td className="py-3 pr-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold">{lk.entryName(r.entryId)}</span>
          <SeedTag seed={entry?.seed} />
          {q && (
            <Pill tone={complete ? 'lime' : 'neutral'} className="min-h-5 px-1.5 text-[11px]">
              Q
            </Pill>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-muted">
          <span className="truncate">{lk.entryClub(r.entryId)}</span>
          {r.note && r.note !== 'Level' && <span className="shrink-0 text-[11.5px] italic">· {r.note.toLowerCase()}</span>}
        </div>
      </td>
      <td className="num py-3 text-center font-bold">{r.won}</td>
      <td className="num py-3 text-center">{r.lost}</td>
      <td className="num hidden py-3 text-center xs:table-cell">{signed(r.gamesWon - r.gamesLost)}</td>
      <td className="num hidden py-3 pr-5 text-center sm:table-cell">{signed(r.pointsWon - r.pointsLost)}</td>
    </tr>
  );
}

function CrossTable({ lk, group, matches }: { lk: Lookup; group: Group; matches: Match[] }) {
  const ids = group.entryIds;
  const find = (x: string, y: string) => matches.find((m) => (m.a === x && m.b === y) || (m.a === y && m.b === x));
  const short = (id: string) =>
    lk
      .playersOfEntry(id)
      .map((p) => p.name.split(' ').slice(-1)[0])
      .join('/');
  return (
    <div className="scroll-thin overflow-x-auto border-t border-line p-4">
      <table className="border-separate border-spacing-1 text-[12.5px]">
        <thead>
          <tr>
            <th />
            {ids.map((id, i) => (
              <th key={id} scope="col" className="min-w-[88px] px-1 text-center font-semibold text-muted" title={lk.entryName(id)}>
                {i + 1}. {short(id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map((row, ri) => (
            <tr key={row}>
              <th scope="row" className="whitespace-nowrap pr-2 text-left font-semibold">
                {ri + 1}. {short(row)}
              </th>
              {ids.map((col) => {
                if (row === col) return <td key={col} className="rounded-lg bg-sunken" />;
                const m = find(row, col);
                if (!m || m.status !== 'finished')
                  return (
                    <td key={col} className="rounded-lg border border-dashed border-line px-2 py-2 text-center text-muted">
                      {m?.status === 'on_court' ? (
                        <span className="font-semibold text-live">Live</span>
                      ) : m ? (
                        <span className="num">#{m.number}</span>
                      ) : (
                        '–'
                      )}
                    </td>
                  );
                const rowIsA = m.a === row;
                const won = (m.winner === 'a') === rowIsA;
                const score = m.result === 'walkover' ? 'W/O' : m.games.map(([x, y]) => (rowIsA ? `${x}-${y}` : `${y}-${x}`)).join(' ');
                return (
                  <td
                    key={col}
                    className={cn('rounded-lg px-2 py-2 text-center', won ? 'bg-primary text-primary-fg' : 'bg-sunken text-muted')}
                  >
                    <div className="font-bold">{won ? 'W' : 'L'}</div>
                    <div className="num whitespace-nowrap text-[11px]">{score}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
