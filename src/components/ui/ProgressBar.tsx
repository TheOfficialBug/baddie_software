import { cn } from '@/lib/cn';

export function ProgressBar({
  value,
  max,
  className,
  tone = 'lime',
}: {
  value: number;
  max: number;
  className?: string;
  tone?: 'lime' | 'ink';
}) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div
      className={cn('h-2 overflow-hidden rounded-full bg-sunken', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', tone === 'lime' ? 'bg-primary' : 'bg-fg')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
