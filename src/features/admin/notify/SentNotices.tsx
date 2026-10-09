import type { Lookup } from '@/data/lookup';
import type { Notice } from '@/data/types';

import { NoticeItem } from '@/components/notices/Notices';
import { Pill } from '@/components/tournament/Badges';

/** Notifications already sent for the tournament, with audience and channels. */
export function SentNotices({ sent, now, lk }: { sent: Notice[]; now: number; lk: Lookup }) {
  return (
    <section className="panel py-2" aria-label="Sent">
      <div className="flex items-center justify-between px-5 py-3">
        <h2 className="font-display text-[20px] font-bold">Sent</h2>
        <Pill tone="muted">{sent.length}</Pill>
      </div>
      <div className="scroll-thin max-h-[520px] divide-y divide-line overflow-y-auto border-t border-line px-5">
        {sent.map((n) => (
          <div key={n.id}>
            <NoticeItem n={n} now={now} compact />
            <div className="-mt-2 flex flex-wrap gap-1.5 pb-3 pl-[52px] text-[12px] text-muted">
              <span>
                {n.audience === 'all'
                  ? 'Everyone'
                  : n.audience === 'event'
                    ? lk.event(n.eventId)?.name
                    : `${n.playerIds?.length ?? 0} players`}
              </span>
              <span>· {n.channels.map((c) => (c === 'app' ? 'app' : c === 'sms' ? 'text' : 'email')).join(', ')}</span>
            </div>
          </div>
        ))}
        {sent.length === 0 && <p className="py-4 text-[14px] text-muted">Nothing sent yet.</p>}
      </div>
    </section>
  );
}
