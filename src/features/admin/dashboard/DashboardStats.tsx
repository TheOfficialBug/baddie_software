import type { QueueItem } from '@/engine/scheduler';

import { fmtTime } from '@/lib/format';

import { fmtDuration } from '@/components/match/matchTiming';
import { Stat } from '@/components/ui/Section';

interface StatsProps {
  liveCount: number;
  courtCount: number;
  queue: QueueItem[];
  accepted: number;
  eventCount: number;
  left: number;
  finishAt: number;
  avg: number;
}

/** "At a glance" row: live matches, ready queue, entries and estimated finish. */
export function DashboardStats({ liveCount, courtCount, queue, accepted, eventCount, left, finishAt, avg }: StatsProps) {
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="At a glance">
      <Stat label="Live now" value={liveCount} sub={`on ${courtCount} courts`} />
      <Stat
        label="Ready to call"
        value={queue.length}
        sub={queue.filter((q) => q.resting).length ? `${queue.filter((q) => q.resting).length} resting` : 'all players rested'}
      />
      <Stat label="Entries" value={accepted} sub={`across ${eventCount} events`} />
      <Stat
        label="Est. finish"
        value={left ? fmtTime(finishAt).replace(/ ?[AP]M/, '') : 'Done'}
        sub={left ? `${fmtTime(finishAt).slice(-2)} · avg match ${fmtDuration(avg)}` : 'all matches played'}
      />
    </section>
  );
}
