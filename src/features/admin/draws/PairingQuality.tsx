import type { ID, TEvent } from '@/engine/types';

import { type Lookup } from '@/data/lookup';

import { Pill } from '@/components/tournament/Badges';
import { Icon } from '@/components/ui/Icon';

const LEVEL_LETTER = (v: number) => (v >= 3.75 ? 'A' : v >= 2.75 ? 'B' : v >= 1.75 ? 'C' : 'D');

/** How good the generated pairings are: level match-ups and same-club meetings in the first round (or groups). */
export function PairingQuality({ lk, ev, levelOf }: { lk: Lookup; ev: TEvent; levelOf: (id: ID) => number }) {
  const club = (id: ID) => {
    const cs = new Set(lk.playersOfEntry(id).map((p) => p.club));
    return cs.size === 1 ? [...cs][0] : undefined;
  };
  const stages = lk.stagesOf(ev.id);
  const first = stages[0];
  if (!first) return null;
  const matchups = new Map<string, number>();
  let sameClub = 0;
  let pairs = 0;
  let byes = 0;
  if (first.kind === 'knockout') {
    for (const m of lk.matchesOfEvent(ev.id).filter((x) => x.stageId === first.id && x.round === 1)) {
      if (m.a === 'BYE' || m.b === 'BYE') {
        byes++;
        continue;
      }
      if (!m.a || !m.b) continue;
      pairs++;
      const k = [LEVEL_LETTER(levelOf(m.a)), LEVEL_LETTER(levelOf(m.b))].sort().join('–');
      matchups.set(k, (matchups.get(k) ?? 0) + 1);
      if (club(m.a) && club(m.a) === club(m.b)) sameClub++;
    }
  } else {
    for (const g of lk.groupsOf(first.id)) {
      const ids = g.entryIds;
      ids.forEach((x, i) => ids.slice(i + 1).forEach((y) => club(x) && club(x) === club(y) && sameClub++));
      const k = ids
        .map((x) => LEVEL_LETTER(levelOf(x)))
        .sort()
        .join('');
      matchups.set(`${g.name}: ${k}`, 1);
      pairs++;
    }
  }
  const isGroups = first.kind !== 'knockout';
  return (
    <section className="panel flex flex-col gap-3 p-4 sm:p-5" aria-label="Pairing check">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="ranking" size={20} />
        <h3 className="font-display text-[17px] font-bold">{isGroups ? 'Group balance' : 'First-round check'}</h3>
        <Pill tone={sameClub ? 'warn' : 'ok'} className="ml-auto">
          {sameClub
            ? `${sameClub} same-club ${isGroups ? 'pairs in a group' : 'match' + (sameClub > 1 ? 'es' : '')}`
            : 'No same-club meetings'}
        </Pill>
      </div>
      <div className="flex flex-wrap gap-2">
        {[...matchups.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([k, v]) => (
            <span key={k} className="num inline-flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1 text-[13px] font-semibold">
              {isGroups ? (
                k
              ) : (
                <>
                  {k} <span className="font-normal text-muted">× {v}</span>
                </>
              )}
            </span>
          ))}
        {byes > 0 && (
          <span className="inline-flex items-center rounded-full bg-sunken px-3 py-1 text-[13px] text-muted">
            {byes} bye{byes > 1 ? 's' : ''} to the top-ranked
          </span>
        )}
      </div>
      <p className="text-[12.5px] text-muted">
        {isGroups ? 'Skill levels in each group (A strongest).' : `Skill levels meeting in ${pairs} first-round matches (A strongest).`}{' '}
        Uneven numbers are handled with byes and the next-closest level.
      </p>
    </section>
  );
}
