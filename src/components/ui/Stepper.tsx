import { Icon } from '@/components/ui/Icon';

/** − value + control for small whole numbers (courts, seeds…). */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  id,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  id?: string;
  suffix?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div
      id={id}
      role="group"
      aria-label={label}
      className="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-full border border-line-strong bg-surface p-1 sm:w-auto"
    >
      <button
        type="button"
        aria-label={`Fewer ${label.toLowerCase()}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="grid h-9 w-9 place-items-center rounded-full bg-sunken text-fg transition-colors hover:bg-line disabled:opacity-35"
      >
        <Icon name="minus" size={18} />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ''));
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
        className="num w-12 bg-transparent text-center text-[17px] font-semibold outline-none"
      />
      {suffix && <span className="-ml-1 pr-1 text-[13px] text-muted">{suffix}</span>}
      <button
        type="button"
        aria-label={`More ${label.toLowerCase()}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="grid h-9 w-9 place-items-center rounded-full bg-fg text-bg transition-colors hover:bg-fg/85 disabled:opacity-35"
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}
