import { useState } from 'react';

import type { ID } from '@/engine/types';

import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/cn';
import { fmtAgo } from '@/lib/format';

import { useStore } from '@/data/store';
import type { Notice } from '@/data/types';

import { useAccess } from '@/auth/useAccess';

import { NOTICE_ICON, useNoticesFor } from '@/components/notices/useNotices';
import { Button, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Empty } from '@/components/ui/Empty';
import { Icon } from '@/components/ui/Icon';

export function NoticeItem({ n, now, compact }: { n: Notice; now: number; compact?: boolean }) {
  return (
    <div className={cn('flex gap-3', compact ? 'py-3' : 'rounded-2xl border border-line p-4')}>
      <span
        className={cn(
          'grid h-10 w-10 shrink-0 place-items-center rounded-full',
          n.kind === 'call' ? 'bg-primary text-primary-fg' : n.kind === 'delay' ? 'bg-warn-soft text-warn' : 'bg-sunken text-fg',
        )}
      >
        <Icon name={NOTICE_ICON[n.kind]} size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-semibold leading-snug">{n.title}</span>
          <span className="text-[12px] text-faint">{fmtAgo(n.at, now)}</span>
        </div>
        {n.body && <p className="mt-0.5 text-[14px] text-muted">{n.body}</p>}
      </div>
    </div>
  );
}

/** Bell with unread count; opens the viewer's inbox. */
export function NoticeBell({ tone = 'default', tournamentId }: { tone?: 'default' | 'hero'; tournamentId?: ID }) {
  const { playerId } = useAccess();
  const seenAt = useStore((s) => s.noticesSeenAt);
  const markSeen = useStore((s) => s.markNoticesSeen);
  const clearNotices = useStore((s) => s.clearNotices);
  const list = useNoticesFor(playerId, tournamentId);
  const unread = list.filter((n) => n.at > seenAt).length;
  const [open, setOpen] = useState(false);
  const now = useNow(30000);
  return (
    <>
      <IconButton
        label={unread ? `Notifications, ${unread} new` : 'Notifications'}
        tone={tone}
        onClick={() => {
          setOpen(true);
          markSeen();
        }}
      >
        <Icon name="bell" size={20} />
        {unread > 0 && (
          <span className="num absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-live px-1 text-[11px] font-semibold text-white ring-2 ring-bg">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </IconButton>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        side="right"
        title="Notifications"
        subtitle="Court calls and announcements from the tournament desk."
      >
        {list.length === 0 ? (
          <Empty icon="bell" title="All caught up" body="When the desk calls your match or posts an announcement, it shows up here." />
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="-mt-1 flex items-center justify-between">
              <span className="text-[13px] text-muted">
                {list.length} notification{list.length === 1 ? '' : 's'}
              </span>
              <Button variant="ghost" size="sm" icon={<Icon name="check" size={16} />} onClick={clearNotices}>
                Clear all
              </Button>
            </div>
            {list.map((n) => (
              <NoticeItem key={n.id} n={n} now={now} />
            ))}
          </div>
        )}
      </Dialog>
    </>
  );
}

/** Latest tournament-wide announcement as a dismissible banner. */
export function AnnouncementBanner({ tournamentId }: { tournamentId: ID }) {
  const notices = useStore((s) => s.notices);
  const now = useNow(30000);
  const [hidden, setHidden] = useState<string | null>(null);
  const latest = notices
    .filter(
      (n) =>
        n.tournamentId === tournamentId &&
        n.audience === 'all' &&
        (n.kind === 'announcement' || n.kind === 'delay') &&
        now - n.at < 6 * 3600_000,
    )
    .sort((a, b) => b.at - a.at)[0];
  if (!latest || hidden === latest.id) return null;
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-2xl p-4',
        latest.kind === 'delay' ? 'bg-warn-soft text-warn' : 'bg-info-soft text-info',
      )}
    >
      <Icon name={NOTICE_ICON[latest.kind]} size={20} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{latest.title}</div>
        {latest.body && <p className="text-[14px] opacity-90">{latest.body}</p>}
        <p className="mt-0.5 text-[12px] opacity-75">From the tournament desk · {fmtAgo(latest.at, now)}</p>
      </div>
      <button
        onClick={() => setHidden(latest.id)}
        aria-label="Hide announcement"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-black/5"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
