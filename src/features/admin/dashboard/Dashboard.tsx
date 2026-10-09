import { useParams } from 'react-router';

import { useNow } from '@/hooks/useNow';
import { fmtDate } from '@/lib/format';

import { useLookup } from '@/data/lookup';
import { useQueue } from '@/data/queries';
import { useStore } from '@/data/store';

import { averageDuration } from '@/components/match/matchTiming';
import { NotFound } from '@/components/NotFound';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';

import { useAdmin } from '@/features/admin/adminContext';
import { DashboardHero } from '@/features/admin/dashboard/DashboardHero';
import { DashboardStats } from '@/features/admin/dashboard/DashboardStats';
import { dashboardTodos } from '@/features/admin/dashboard/dashboardTodos';
import { RecentNotices } from '@/features/admin/dashboard/RecentNotices';
import { TodoList } from '@/features/admin/dashboard/TodoList';
import { TournamentChecklist } from '@/features/admin/dashboard/TournamentChecklist';

export function Dashboard() {
  const { tid } = useParams();
  const lk = useLookup();
  const t = lk.tournament(tid);
  const now = useNow(15000);
  const queue = useQueue(lk, t ?? lk.tournaments[0], now);
  const notices = useStore((s) => s.notices);
  const { openScore } = useAdmin();
  if (!t) return <NotFound what="tournament" />;

  const base = `/admin/t/${t.id}`;
  const events = lk.eventsOf(t.id);
  const matches = lk.matchesOf(t.id).filter((m) => m.status !== 'bye' && m.number > 0);
  const done = matches.filter((m) => m.status === 'finished').length;
  const onCourt = matches.filter((m) => m.status === 'on_court');
  const entries = events.flatMap((e) => lk.entriesOf(e.id));
  const accepted = entries.filter((e) => e.status === 'accepted').length;
  const pending = entries.filter((e) => e.status === 'pending').length;
  const undrawn = events.filter((e) => e.drawState !== 'published');
  const freeCourts = t.courts.length - onCourt.length;
  const left = matches.length - done;
  const avg = averageDuration(matches) ?? 32 * 60000;
  const finishAt = now + Math.ceil(left / Math.max(1, t.courts.length)) * (avg + 4 * 60000);

  const todos = dashboardTodos({ lk, t, base, now, onCourt, queue, freeCourts, pending, undrawn, openScore });
  const recentNotices = notices
    .filter((n) => n.tournamentId === t.id)
    .sort((a, b) => b.at - a.at)
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow={fmtDate(new Date(now).toISOString().slice(0, 10), { weekday: 'long', month: 'short', day: 'numeric' })}
        title="Dashboard"
        actions={
          <>
            <ButtonLink to={`/t/${t.slug}`} icon={<Icon name="external" size={17} />}>
              Public page
            </ButtonLink>
            <ButtonLink to={`${base}/notify`} variant="ink" icon={<Icon name="megaphone" size={17} />}>
              Send notification
            </ButtonLink>
          </>
        }
      />

      <DashboardHero lk={lk} t={t} base={base} events={events} matches={matches} done={done} onCourt={onCourt} openScore={openScore} />

      <DashboardStats
        liveCount={onCourt.length}
        courtCount={t.courts.length}
        queue={queue}
        accepted={accepted}
        eventCount={events.length}
        left={left}
        finishAt={finishAt}
        avg={avg}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <TodoList todos={todos} />

        <div className="flex min-w-0 flex-col gap-5">
          <TournamentChecklist
            t={t}
            base={base}
            events={events}
            rulesLabel={lk.rules(events[0]?.id ?? '').label ?? ''}
            pending={pending}
            accepted={accepted}
            undrawn={undrawn}
            done={done}
            matchCount={matches.length}
          />
          <RecentNotices notices={recentNotices} base={base} now={now} />
        </div>
      </div>
    </div>
  );
}
