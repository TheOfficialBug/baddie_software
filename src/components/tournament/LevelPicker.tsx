import { useId } from 'react';

import type { SkillLevel } from '@/engine/types';

import { cn } from '@/lib/cn';

import { SKILL_LEVELS } from '@/components/tournament/skillLevels';
import { Icon } from '@/components/ui/Icon';

/** Four ascending bars, `n` of them filled: a quick visual for a level. */
export function LevelBars({ n, className }: { n: number; className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex h-4 items-end gap-[3px]', className)}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn('w-[4px] rounded-full', i <= n ? 'bg-current' : 'bg-current opacity-20')}
          style={{ height: `${25 * i}%` }}
        />
      ))}
    </span>
  );
}

/**
 * Required skill-level choice as four tappable cards (2×2 on phones, one row from tablets up).
 * Built on real radio inputs, so arrow keys and screen readers work as expected.
 */
export function LevelPicker({
  label,
  value,
  onChange,
  error,
  hint,
}: {
  label: string;
  value: SkillLevel | undefined;
  onChange: (v: SkillLevel) => void;
  /** Shown when the field was left empty and the user tried to continue. */
  error?: string;
  hint?: string;
}) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-invalid={!!error || undefined}>
      <legend className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold">
        {label}
        <span className="text-live" aria-hidden>
          *
        </span>
        <span className="sr-only">(required)</span>
      </legend>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {SKILL_LEVELS.map((s) => {
          const on = value === s.value;
          return (
            <label
              key={s.value}
              className={cn(
                'relative flex min-h-[92px] cursor-pointer flex-col gap-1.5 rounded-2xl border-[1.5px] p-3 transition-[background-color,border-color,transform] duration-150 active:scale-[0.98]',
                'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-info/40',
                on
                  ? 'border-primary bg-primary text-primary-fg shadow-lift'
                  : cn('bg-surface hover:border-fg/40', error ? 'border-live/50' : 'border-line'),
              )}
            >
              <input type="radio" name={name} value={s.value} checked={on} onChange={() => onChange(s.value)} className="sr-only" />
              <span className="flex items-center gap-2">
                <LevelBars n={s.bars} className={on ? 'text-primary-fg' : 'text-fg'} />
                <span className={cn('num text-[12px] font-semibold', on ? 'text-primary-fg/70' : 'text-faint')}>{s.value}</span>
                <span
                  className={cn(
                    'ml-auto grid h-5 w-5 place-items-center rounded-full border-[1.5px] transition-colors',
                    on ? 'border-primary-fg bg-primary-fg text-primary' : 'border-line-strong',
                  )}
                >
                  {on && <Icon name="check" size={12} strokeWidth={3} />}
                </span>
              </span>
              <span className="text-[15px] font-bold leading-tight">{s.title}</span>
              <span className={cn('text-[12.5px] leading-snug', on ? 'text-primary-fg/75' : 'text-muted')}>{s.body}</span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-live">
          <Icon name="alert" size={15} /> {error}
        </p>
      ) : (
        hint && <p className="text-[13px] text-muted">{hint}</p>
      )}
    </fieldset>
  );
}
