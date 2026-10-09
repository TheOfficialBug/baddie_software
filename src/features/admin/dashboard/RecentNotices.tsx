import { Link } from 'react-router';

import type { Notice } from '@/data/types';

import { NoticeItem } from '@/components/notices/Notices';

/** The latest notifications sent for this tournament, with a link to send one. */
export function RecentNotices({ notices, base, now }: { notices: Notice[]; base: string; now: number }) {
  return (
    <section className="panel py-2" aria-label="Recent notifications">
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <h2 className="font-display text-[20px] font-bold">Recent notifications</h2>
        <Link to={`${base}/notify`} className="text-[13.5px] font-semibold hover:underline">
          Send one
        </Link>
      </div>
      <div className="divide-y divide-line border-t border-line px-5">
        {notices.length ? (
          notices.map((n) => <NoticeItem key={n.id} n={n} now={now} compact />)
        ) : (
          <p className="py-4 text-[14px] text-muted">No notifications sent yet.</p>
        )}
      </div>
    </section>
  );
}
