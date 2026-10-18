import { type ReactNode } from 'react';
import { NavLink } from 'react-router';

import { cn } from '@/lib/cn';

/** Pill segmented control (one choice). Scrolls sideways on narrow screens instead of wrapping. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = 'md',
  stretch,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number; disabled?: boolean }[];
  label: string;
  className?: string;
  size?: 'sm' | 'md';
  stretch?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'scrollbar-none inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-sunken p-1',
        stretch && 'flex w-full',
        className,
      )}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-colors disabled:opacity-40',
              size === 'sm' ? 'min-h-9 px-3 text-[12.5px] touch:min-h-10' : 'min-h-10 px-4 text-[13.5px] touch:min-h-11',
              on ? 'bg-surface text-fg shadow-lift' : 'text-muted hover:text-fg',
              stretch && 'flex-1',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="num text-[11.5px] font-medium opacity-70">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Filter chips (several visible at once, one active): ink when selected. */
export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0', className)}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-10 shrink-0 rounded-full border px-4 text-[13px] font-semibold transition-colors touch:min-h-11',
              on ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-fg hover:border-fg/50',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabLinks({
  items,
  className,
  tone = 'default',
}: {
  items: { to: string; label: string; end?: boolean; badge?: ReactNode }[];
  className?: string;
  tone?: 'default' | 'hero';
}) {
  return (
    <nav className={cn('scrollbar-none flex gap-1 overflow-x-auto', className)}>
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) =>
            cn(
              'inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-[15px] font-semibold transition-colors',
              isActive
                ? cn('border-primary', tone === 'hero' ? 'text-hero-fg' : 'text-fg')
                : cn('border-transparent', tone === 'hero' ? 'text-hero-muted hover:text-hero-fg' : 'text-muted hover:text-fg'),
            )
          }
        >
          {it.label}
          {it.badge}
        </NavLink>
      ))}
    </nav>
  );
}
