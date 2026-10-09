import type { Mode } from '@/engine/types';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from '@/components/ui/Icon';

import { StepHead } from '@/features/admin/draws/StepHead';

const MODE_INFO: Record<Mode, { title: string; body: string; guarantee: string; icon: IconName }> = {
  round_robin: {
    title: 'Round robin',
    body: 'Groups where everyone plays everyone. The top 1 or 2 can go on to a knockout.',
    guarantee: 'Every match in their group',
    icon: 'ranking',
  },
  drop_flight: {
    title: 'Drop flight',
    body: 'Everyone starts in A. Losers drop to the B, C and D flights instead of going home.',
    guarantee: '3 matches (A/B/C/D) or 2 (A/B) in a full draw; byes can cut it by one',
    icon: 'draws',
  },
  knockout: {
    title: 'Knockout',
    body: 'Lose once and you are out. BWF seeding and byes, with an optional plate and 3rd place match.',
    guarantee: '1 match, or 2 with a plate',
    icon: 'trophy',
  },
};

/** Step 1: pick the draw format (round robin, drop flight or knockout). */
export function FormatStep({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <section aria-labelledby="db-format">
      <StepHead n={1} id="db-format" title="Choose a format" />
      <div className="grid gap-2.5 md:grid-cols-3 xl:grid-cols-1">
        {(Object.keys(MODE_INFO) as Mode[]).map((m) => {
          const on = mode === m;
          const info = MODE_INFO[m];
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              aria-pressed={on}
              className={cn(
                'relative flex min-w-0 items-start gap-3.5 rounded-2xl border bg-surface p-4 text-left transition-colors',
                on ? 'border-fg ring-1 ring-fg' : 'border-line hover:border-fg/40',
              )}
            >
              <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl', on ? 'bg-fg text-bg' : 'bg-sunken text-fg')}>
                <Icon name={info.icon} size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{info.title}</span>
                  {on && <Icon name="success" size={18} className="ml-auto text-fg" label="Selected" />}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">{info.body}</span>
                <span className="mt-2 block text-[12.5px] font-semibold text-accent">Everyone gets: {info.guarantee}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
