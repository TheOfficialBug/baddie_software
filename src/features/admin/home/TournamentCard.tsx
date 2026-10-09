import { Link } from 'react-router';

import type { Tournament } from '@/engine/types';

import { fmtDateRange } from '@/lib/format';

import { type Lookup } from '@/data/lookup';

import { LiveDot, Pill } from '@/components/tournament/Badges';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ProgressBar } from '@/components/ui/ProgressBar';

import { summary } from '@/features/admin/home/tournamentSummary';

export function StatusBadge({ t }: { t: Tournament }) {
  if (t.status === 'live')
    return (
      <Pill tone="live">
        <LiveDot /> Live
      </Pill>
    );
  if (t.status === 'registration') return <Pill tone="ok">Registration open</Pill>;
  if (t.status === 'closed') return <Pill tone="info">Registration closed</Pill>;
  if (t.status === 'completed') return <Pill tone="muted">Completed</Pill>;
  return <Pill tone="warn">Draft</Pill>;
}

export function TournamentCard({ lk, t }: { lk: Lookup; t: Tournament }) {
  const s = summary(lk, t);
  const stats: { k: string; v: string | number; warn?: boolean }[] = [
    { k: 'Entries', v: s.entries },
    { k: 'To confirm', v: s.pending, warn: s.pending > 0 },
    { k: 'Draws out', v: `${s.published}/${s.events.length}` },
    t.status === 'live' ? { k: 'On court', v: s.onCourt } : { k: 'Courts', v: t.courts.length },
  ];
  return (
    <article className="panel panel-hover flex min-w-0 flex-col gap-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge t={t} />
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
          <Icon name="calendar" size={16} /> {fmtDateRange(t.startDate, t.endDate)}
        </span>
      </div>
      <div className="min-w-0">
        <Link
          to={`/admin/t/${t.id}`}
          className="block font-display text-[clamp(20px,2.2vw,24px)] font-extrabold leading-tight transition-colors hover:text-accent"
        >
          {t.name}
        </Link>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[14px] text-muted">
          <Icon name="location" size={16} />
          <span className="truncate">
            {t.venue}, {t.city}
          </span>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 xs:grid-cols-4">
        {stats.map(({ k, v, warn }) => (
          <div key={k} className="min-w-0 rounded-xl bg-sunken px-3 py-2.5">
            <dt className="truncate text-[12px] font-semibold text-muted">{k}</dt>
            <dd className={warn ? 'num text-[20px] font-semibold text-warn' : 'num text-[20px] font-semibold'}>{v}</dd>
          </div>
        ))}
      </dl>

      {s.matches > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[13px] text-muted">
            <span>Matches played</span>
            <span className="num">
              {s.played}/{s.matches}
            </span>
          </div>
          <ProgressBar value={s.played} max={s.matches} tone={t.status === 'live' ? 'lime' : 'ink'} />
        </div>
      )}

      <div className="mt-auto flex flex-wrap gap-2">
        <ButtonLink
          to={`/admin/t/${t.id}`}
          variant={t.status === 'completed' ? 'secondary' : 'primary'}
          iconRight={<Icon name="right" size={18} />}
        >
          {t.status === 'live' ? 'Run match day' : 'Manage'}
        </ButtonLink>
        <ButtonLink to={`/admin/t/${t.id}/entries`} variant="secondary">
          Entries
        </ButtonLink>
        <ButtonLink to={`/t/${t.slug}`} variant="ghost" icon={<Icon name="external" size={18} />}>
          Public page
        </ButtonLink>
      </div>
    </article>
  );
}
