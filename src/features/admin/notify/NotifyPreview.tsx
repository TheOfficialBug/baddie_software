import { APP_NAME } from '@/config/app';

import { cn } from '@/lib/cn';

import type { NoticeKind } from '@/data/types';

import { NOTICE_ICON } from '@/components/notices/useNotices';
import { Icon } from '@/components/ui/Icon';

/** Phone-style lock-screen preview of the notification being composed. */
export function NotifyPreview({ kind, title, body, fallback }: { kind: NoticeKind; title: string; body: string; fallback: string }) {
  return (
    <section className="flex flex-col gap-3" aria-label="Preview">
      <span className="eyebrow">Preview on a phone</span>
      <div className="mx-auto w-full max-w-[340px] rounded-[28px] border border-line bg-sunken p-3">
        <div className="flex gap-3 rounded-2xl bg-raised p-3.5 shadow-lift">
          <span
            className={cn(
              'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
              kind === 'delay' ? 'bg-warn-soft text-warn' : 'bg-primary text-primary-fg',
            )}
          >
            <Icon name={NOTICE_ICON[kind]} size={20} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted">
              <span className="font-semibold uppercase tracking-wider">{APP_NAME}</span>
              <span>now</span>
            </div>
            <div className="truncate text-[14px] font-semibold">{title || 'Your headline'}</div>
            <div className="line-clamp-2 text-[13px] text-muted">{body || fallback}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
