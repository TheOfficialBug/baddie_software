import { env } from '@/config/env';
import type { TEvent, Tournament } from '@/engine/types';

import { fmtDate, money } from '@/lib/format';

import { isDoubles } from '@/data/eligibility';

import { EventChip } from '@/components/tournament/Badges';
import { LevelBars } from '@/components/tournament/LevelPicker';
import { levelInfo } from '@/components/tournament/skillLevels';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

import { type EventDetails, formatOf, type Picks, type Registrant } from '@/features/public/register/registrationTypes';

type Props = {
  t: Tournament;
  me: Registrant;
  chosen: TEvent[];
  picked: Picks;
  total: number;
  onEditStep: (step: number) => void;
};

function LevelTag({ level, who }: { level: NonNullable<EventDetails['myLevel']>; who: string }) {
  const info = levelInfo(level);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 text-[12.5px] font-medium">
      <LevelBars n={info.bars} className="h-3" />
      <span className="text-muted">{who}</span> {info.title}
    </span>
  );
}

/** Step 4: summary of the player, events, levels and partners before paying. */
export function ReviewStep({ t, me, chosen, picked, total, onEditStep }: Props) {
  return (
    <section aria-labelledby="step-review">
      <h2 id="step-review" className="mb-1 font-display text-[18px] font-extrabold sm:text-[20px]">
        Check and pay
      </h2>
      <p className="mb-4 text-[14px] text-muted">Make sure everything looks right. Tap Edit to change a section.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="panel divide-y divide-line">
          <div className="flex items-start gap-3 p-4 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="eyebrow mb-1">Player</div>
              <div className="truncate font-semibold">{me.name}</div>
              <div className="text-[13px] text-muted">
                {me.club} · born <span className="num">{me.birthYear}</span>
              </div>
              <div className="truncate text-[13px] text-muted">{me.email}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onEditStep(0)} icon={<Icon name="edit" size={16} />}>
              Edit
            </Button>
          </div>
          {chosen.map((ev) => {
            const d = picked[ev.id];
            const doubles = isDoubles(ev.kind);
            const partner = !doubles
              ? null
              : d.partnerMode === 'find'
                ? 'Looking for a partner'
                : `With ${d.partnerName.trim()}${d.partnerId ? '' : d.partnerEmail ? ' · invite will be emailed' : ' · not registered yet'}`;
            return (
              <div key={ev.id} className="flex flex-col gap-2 p-4 sm:px-5">
                <div className="flex items-center gap-3">
                  <EventChip kind={ev.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{ev.name}</div>
                    <div className="truncate text-[13px] text-muted">{partner ?? formatOf(ev.kind)}</div>
                  </div>
                  <span className="num shrink-0">{money(ev.fee)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-0 sm:pl-[52px]">
                  {d.myLevel && <LevelTag level={d.myLevel} who="You" />}
                  {doubles && d.partnerMode === 'named' && d.partnerLevel && (
                    <LevelTag level={d.partnerLevel} who={d.partnerName.trim().split(/\s+/)[0]} />
                  )}
                  <button
                    type="button"
                    onClick={() => onEditStep(2)}
                    className="ml-auto min-h-9 rounded-full px-3 text-[13px] font-semibold text-muted hover:text-fg"
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between p-4 sm:px-5">
            <span className="font-semibold">Total</span>
            <span className="num text-[26px] font-semibold">{money(total)}</span>
          </div>
        </div>
        <div className="panel flex flex-col gap-3 self-start p-5">
          <div className="flex items-center gap-2 font-semibold">
            <Icon name="card" size={20} /> Payment
          </div>
          <p className="text-[14px] text-muted">
            {env.supabase
              ? 'Entry fees are paid to the organizer, not online. Your entry is confirmed once the organizer accepts it.'
              : "In the live app, a secure card checkout opens when you tap Pay. This demo doesn't take real payments."}
          </p>
          <p className="text-[13px] text-faint">
            Refunds are available until registration closes on {fmtDate(t.regCloses ?? t.startDate)}.
          </p>
        </div>
      </div>
    </section>
  );
}
