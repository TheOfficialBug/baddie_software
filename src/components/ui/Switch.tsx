import { type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export function Switch({
  label,
  on,
  onChange,
  description,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
  description?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold">{label}</div>
        {description && <div className="text-[13px] text-muted">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={cn(
          'tap-target relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          on ? 'bg-fg' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-5 w-5 rounded-full shadow transition-[left] duration-150',
            on ? 'left-6 bg-primary' : 'left-1 bg-surface',
          )}
        />
      </button>
    </div>
  );
}
