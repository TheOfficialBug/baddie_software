import { type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Icon } from '@/components/ui/Icon';

export interface Step {
  title: string;
  body?: ReactNode;
  done?: boolean;
  current?: boolean;
  action?: ReactNode;
}

/** Numbered checklist with done / current states. */
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
          {i < steps.length - 1 && (
            <span className={cn('absolute bottom-1 left-[17px] top-10 w-0.5 rounded-full', s.done ? 'bg-fg/40' : 'bg-line')} aria-hidden />
          )}
          <span
            className={cn(
              'num relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[14px] font-semibold',
              s.done ? 'bg-fg text-bg' : s.current ? 'bg-primary text-primary-fg' : 'border border-line-strong bg-surface text-muted',
            )}
          >
            {s.done ? <Icon name="check" size={18} strokeWidth={2.4} /> : i + 1}
          </span>
          <div className="min-w-0 flex-1 pt-1.5">
            <div className={cn('text-[15px] font-semibold', !s.done && !s.current && 'text-muted')}>{s.title}</div>
            {s.body && <div className="mt-0.5 text-[14px] text-muted">{s.body}</div>}
            {s.action && <div className="mt-3">{s.action}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
