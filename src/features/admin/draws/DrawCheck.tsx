import type { ID, TEvent } from '@/engine/types';

import { cn } from '@/lib/cn';

import { entryClub } from '@/data/clubs';
import { type Lookup } from '@/data/lookup';

import { HelpTip } from '@/components/ui/HelpTip';
import { Icon } from '@/components/ui/Icon';

const LEVEL_LETTER = (v: number) => (v >= 3.75 ? 'A' : v >= 2.75 ? 'B' : v >= 1.75 ? 'C' : 'D');

/**
 * The draft at a glance, in one line: do clubmates meet early, which levels meet in round 1 (or
 * how each group is mixed), and who gets byes. Problems the draw couldn't avoid follow as short notes.
 */
export function DrawCheck({ lk, ev, levelOf, warnings }: { lk: Lookup; ev: TEvent; levelOf: (id: ID) => number; warnings: string[] }) {
  const first = lk.stagesOf(ev.id)[0];
  if (!first) return null;
  const club = (id: ID) => entryClub(lk.playersOfEntry(id));
  const isGroups = first.kind !== 'knockout';

  const matchups = new Map<string, number>();
  const clashes: string[] = [];
  let byes = 0;
  /** byes after round 1, by round: a player who skips round 2, round 3 … (an empty corner of the bracket) */
  const laterByes = new Map<number, number>();
  if (!isGroups) {
    for (const m of lk.matchesOfEvent(ev.id).filter((x) => x.stageId === first.id && x.round > 1))
      if ((m.srcA.kind === 'bye') !== (m.srcB.kind === 'bye')) laterByes.set(m.round, (laterByes.get(m.round) ?? 0) + 1);
    for (const m of lk.matchesOfEvent(ev.id).filter((x) => x.stageId === first.id && x.round === 1)) {
      if (m.srcA.kind === 'bye' && m.srcB.kind === 'bye') continue;
      if (m.a === 'BYE' || m.b === 'BYE') {
        byes++;
        continue;
      }
      if (!m.a || !m.b) continue;
      const k = [LEVEL_LETTER(levelOf(m.a)), LEVEL_LETTER(levelOf(m.b))].sort().join(' v ');
      matchups.set(k, (matchups.get(k) ?? 0) + 1);
      if (club(m.a) && club(m.a) === club(m.b)) clashes.push(`${lk.entryName(m.a)} and ${lk.entryName(m.b)} (${club(m.a)})`);
    }
  } else {
    for (const g of lk.groupsOf(first.id)) {
      const ids = g.entryIds;
      ids.forEach((x, i) =>
        ids.slice(i + 1).forEach((y) => {
          if (club(x) && club(x) === club(y)) clashes.push(`${lk.entryName(x)} and ${lk.entryName(y)} in ${g.name} (${club(x)})`);
        }),
      );
      matchups.set(
        `${g.name.replace('Group ', '')}: ${ids
          .map((x) => LEVEL_LETTER(levelOf(x)))
          .sort()
          .join('')}`,
        1,
      );
    }
  }
  // club clashes are listed from the draft itself; other notes (byes for a plate, …) come from the draw
  const notes = warnings.filter((w) => !w.includes('meet in round 1'));

  // Clubmates are spread through the draw automatically; only a meeting that couldn't be avoided is shown.
  const chip = 'inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold';
  return (
    <section className="flex flex-col gap-1.5" aria-label="Draft check">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-0.5 text-[12.5px] text-muted">
          {isGroups ? 'Levels per group' : 'Round 1 levels'}
          <HelpTip label="Levels" className="-my-1">
            {isGroups
              ? 'The skill levels in each group (A strongest). An even mix means fair groups.'
              : 'Which skill levels meet in the first round (A strongest), and how often. Byes go to the top-ranked players.'}
          </HelpTip>
        </span>
        {[...matchups.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([k, v]) => (
            <span key={k} className={cn(chip, 'bg-sunken')}>
              {k}
              {!isGroups && <span className="num font-normal text-muted">×{v}</span>}
            </span>
          ))}
        {byes > 0 && (
          <span className={cn(chip, 'bg-sunken font-normal text-muted')}>
            <span className="num">{byes}</span> bye{byes > 1 ? 's' : ''}
          </span>
        )}
        {[...laterByes].map(([round, k]) => (
          <span key={round} className={cn(chip, 'bg-sunken font-normal text-muted')}>
            <span className="num">{k}</span> round-{round} bye{k > 1 ? 's' : ''}
          </span>
        ))}
      </div>
      {(clashes.length > 0 || notes.length > 0) && (
        <ul className="flex flex-col gap-0.5 text-[12.5px] text-warn">
          {clashes.map((c) => (
            <li key={c} className="flex items-start gap-1.5">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
              <span>{c} meet early: there weren&apos;t enough places to keep them apart.</span>
            </li>
          ))}
          {notes.map((w) => (
            <li key={w} className="flex items-start gap-1.5">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
