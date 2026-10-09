import { cn } from '@/lib/cn';

import { Icon } from '@/components/ui/Icon';

import { STEPS } from '@/features/public/register/registrationTypes';

/**
 * Wizard progress. Phones show "Step 2 of 4 · Events" with a bar; larger screens list every step.
 * Finished steps are buttons, so players can jump back.
 */
export function StepProgress({ step, onStep }: { step: number; onStep: (s: number) => void }) {
  return (
    <nav aria-label="Registration steps" className="my-6 sm:my-7">
      <div className="sm:hidden">
        <div className="mb-2 flex items-baseline justify-between text-[13px]">
          <span className="font-semibold">{STEPS[step]}</span>
          <span className="num text-muted">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <div className="flex gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= step ? 'bg-primary' : 'bg-line')} />
          ))}
        </div>
      </div>
      <ol className="hidden items-center gap-2 sm:flex">
        {STEPS.map((s, i) => {
          const isDone = i < step;
          const current = i === step;
          const content = (
            <>
              <span
                className={cn(
                  'num grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold',
                  isDone ? 'bg-fg text-bg' : current ? 'bg-primary text-primary-fg' : 'border border-line-strong bg-surface text-muted',
                )}
              >
                {isDone ? <Icon name="check" size={16} strokeWidth={2.4} /> : i + 1}
              </span>
              <span className={cn('truncate text-[13.5px] font-semibold', current ? 'text-fg' : 'text-muted')}>{s}</span>
            </>
          );
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-2" aria-current={current ? 'step' : undefined}>
              {isDone ? (
                <button
                  type="button"
                  onClick={() => onStep(i)}
                  className="flex min-h-11 min-w-0 items-center gap-2 rounded-full hover:text-fg"
                >
                  {content}
                </button>
              ) : (
                <span className="flex min-h-11 min-w-0 items-center gap-2">{content}</span>
              )}
              {i < STEPS.length - 1 && (
                <span className={cn('h-0.5 min-w-3 flex-1 rounded-full', isDone ? 'bg-fg/40' : 'bg-line')} aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
