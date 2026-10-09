import { type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export function SectionHead({
  title,
  action,
  eyebrow,
  description,
  className,
  as = 'h2',
}: {
  title: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  className?: string;
  as?: 'h2' | 'h3';
}) {
  const H = as;
  return (
    <div className={cn('mb-4 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <H className="font-display text-[18px] font-extrabold leading-tight sm:text-[20px]">{title}</H>
        {description && <p className="mt-1 text-[14px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="panel flex min-w-0 flex-col gap-1.5 p-5">
      <span className="eyebrow">{label}</span>
      <span className="font-display text-[clamp(28px,3.4vw,36px)] font-extrabold leading-none">{value}</span>
      {sub && <span className="text-[13px] text-muted">{sub}</span>}
    </div>
  );
}
