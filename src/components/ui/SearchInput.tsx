import { cn } from '@/lib/cn';

import { Icon } from '@/components/ui/Icon';

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className={cn('relative flex min-w-0 items-center', className)}>
      <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 text-muted" />
      <span className="sr-only">{label}</span>
      <input
        // opt-in: only used where the page exists to search
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-11 w-full rounded-full border border-line bg-surface pl-10 pr-10 text-[15px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent focus:ring-[3px] focus:ring-primary/25"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-1.5 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-fg"
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </label>
  );
}
