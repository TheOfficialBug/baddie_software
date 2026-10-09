import { useState } from 'react';

import type { Tournament } from '@/engine/types';

import { useLookup } from '@/data/lookup';

import { orgsWhere } from '@/auth/permissions';
import { useAccess } from '@/auth/useAccess';

import { Button } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Stat } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Tabs';

import { NewTournamentDialog } from '@/features/admin/home/NewTournamentDialog';
import { TournamentCard } from '@/features/admin/home/TournamentCard';
import { summary } from '@/features/admin/home/tournamentSummary';

type Filter = 'all' | 'live' | 'upcoming' | 'completed';

const bucket = (t: Tournament): Exclude<Filter, 'all'> =>
  t.status === 'live' ? 'live' : t.status === 'completed' ? 'completed' : 'upcoming';
const ORDER: Record<Tournament['status'], number> = { live: 0, registration: 1, draft: 2, completed: 3 };

export function AdminHome() {
  const lk = useLookup();
  const access = useAccess();
  const createIn = orgsWhere(access, 'create_tournament');
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // only tournaments of organizations this account is staff of
  const all = lk.tournaments
    .filter((t) => access.roleIn(t.organizationId))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.startDate.localeCompare(b.startDate));
  const count = (f: Filter) => (f === 'all' ? all.length : all.filter((t) => bucket(t) === f).length);
  const shown = filter === 'all' ? all : all.filter((t) => bucket(t) === filter);
  const totals = all.reduce(
    (acc, t) => {
      const s = summary(lk, t);
      return {
        pending: acc.pending + s.pending,
        onCourt: acc.onCourt + s.onCourt,
        entries: acc.entries + (t.status === 'completed' ? 0 : s.entries),
      };
    },
    { pending: 0, onCourt: 0, entries: 0 },
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={today}
        title="Your tournaments"
        description="Set up events, confirm entries, make the draws and run match day, all from here."
        actions={
          createIn.length > 0 && (
            <Button variant="primary" icon={<Icon name="add" size={18} />} onClick={() => setCreating(true)}>
              New tournament
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Live now"
          value={<span className="num">{count('live')}</span>}
          sub={count('live') ? 'Running today' : 'Nothing running'}
        />
        <Stat label="On court" value={<span className="num">{totals.onCourt}</span>} sub="Matches being played" />
        <Stat label="To confirm" value={<span className="num">{totals.pending}</span>} sub="Entries waiting on you" />
        <Stat label="Entries" value={<span className="num">{totals.entries}</span>} sub="Across open events" />
      </div>

      <div className="flex flex-col gap-4">
        <Segmented
          label="Show tournaments"
          value={filter}
          onChange={setFilter}
          className="self-start"
          options={[
            { value: 'all', label: 'All', count: count('all') },
            { value: 'live', label: 'Live', count: count('live') },
            { value: 'upcoming', label: 'Upcoming', count: count('upcoming') },
            { value: 'completed', label: 'Completed', count: count('completed') },
          ]}
        />

        {shown.length === 0 ? (
          <Empty
            icon="calendar"
            title={
              filter === 'live'
                ? 'Nothing is live right now'
                : filter === 'completed'
                  ? 'No finished tournaments yet'
                  : 'No tournaments here'
            }
            body={
              filter === 'all' || filter === 'upcoming'
                ? 'Create a tournament to open registration and start taking entries.'
                : 'Tournaments move here automatically as their status changes.'
            }
            action={
              filter !== 'completed' && filter !== 'live' && createIn.length > 0 ? (
                <Button variant="primary" icon={<Icon name="add" size={18} />} onClick={() => setCreating(true)}>
                  New tournament
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {shown.map((t) => (
              <TournamentCard key={t.id} lk={lk} t={t} />
            ))}
          </div>
        )}
      </div>
      {createIn[0] && <NewTournamentDialog open={creating} orgId={createIn[0]} onClose={() => setCreating(false)} />}
    </div>
  );
}
