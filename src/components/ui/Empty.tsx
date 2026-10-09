import { type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from '@/components/ui/Icon';

export function Empty({
  icon = 'sparkles',
  title,
  body,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-2 grid h-14 w-14 place-items-center rounded-full bg-sunken text-muted">
        <Icon name={icon} size={26} />
      </div>
      <p className="font-display text-[19px] font-bold">{title}</p>
      {body && <p className="max-w-sm text-[14px] text-muted">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
