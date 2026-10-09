import { type ReactNode, useMemo, useState } from 'react';
import { useParams } from 'react-router';

import { type PlayerState, type PlayerStatus, playerStatuses } from '@/engine/scheduler';

import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/cn';
import { fmtAgo } from '@/lib/format';

import { type Lookup, useLookup } from '@/data/lookup';
import { tournamentPlayers } from '@/data/queries';
import { useStore } from '@/data/store';

import { DurationTag } from '@/components/match/Duration';
import { matchContext } from '@/components/match/matchInfo';
import { NotFound } from '@/components/NotFound';
import { EventChip, LiveDot, Pill } from '@/components/tournament/Badges';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { HelpTip } from '@/components/ui/HelpTip';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { Segmented } from '@/components/ui/Tabs';

import { useAdmin } from '@/features/admin/adminContext';

const STATE_INFO: Record<PlayerState, { label: string; tone: 'live' | 'warn' | 'info' | 'muted' | 'ok'; icon: IconName; order: number }> = {
  on_court: { label: 'On court', tone: 'live', icon: 'location', order: 0 },
  resting: { label: 'Resting', tone: 'warn', icon: 'timer', order: 1 },
  ready: { label: 'Ready', tone: 'ok', icon: 'check', order: 2 },
  waiting: { label: 'Waiting', tone: 'info', icon: 'clock', order: 3 },
  done: { label: 'No more matches', tone: 'muted', icon: 'trophy', order: 4 },
};

/** Where every player is right now, so the desk never calls someone who's busy or resting. */
export function LivePlayers() {
  const { tid } = useParams();
  const lk = useLookup();
  const t = lk.tournament(tid);
  const now = useNow(15000);
  const entries = useStore((s) => s.entries);
  const [filter, setFilter] = useState<PlayerState | 'all'>('all');
  const [q, setQ] = useState('');

  const statuses = useMemo(() => {
    if (!t) return new Map<string, PlayerStatus>();
    const evIds = new Set(lk.eventsOf(t.id).map((e) => e.id));
    return playerStatuses(
      lk.matchesOf(t.id),
      new Map(entries.filter((e) => evIds.has(e.eventId)).map((e) => [e.id, e])),
      now,
      t.restMinutes,
    );
  }, [lk, t, entries, now]);

  if (!t) return <NotFound what="tournament" />;
  const players = tournamentPlayers(lk, t).filter((p) => statuses.has(p.id));
  const counts = Object.fromEntries(
    (Object.keys(STATE_INFO) as PlayerState[]).map((s) => [s, players.filter((p) => statuses.get(p.id)!.state === s).length]),
  ) as Record<PlayerState, number>;
  const shown = players
    .filter((p) => filter === 'all' || statuses.get(p.id)!.state === filter)
    .filter((p) => !q.trim() || `${p.name} ${p.club}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort(
      (a, b) => STATE_INFO[statuses.get(a.id)!.state].order - STATE_INFO[statuses.get(b.id)!.state].order || a.name.localeCompare(b.name),
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t.name}
        title="Live players"
        description="Who's on court, who's resting and who's free. The desk won't let you call a player who is already playing."
      />

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5" aria-label="Players by status">
        {(Object.keys(STATE_INFO) as PlayerState[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(filter === s ? 'all' : s)}
            className={cn(
              'panel flex min-w-0 flex-col items-start gap-1 p-4 text-left transition-colors',
              filter === s ? 'border-fg' : 'hover:border-fg/40',
            )}
          >
            <Pill tone={STATE_INFO[s].tone}>
              {s === 'on_court' ? <LiveDot /> : <Icon name={STATE_INFO[s].icon} size={13} />} {STATE_INFO[s].label}
            </Pill>
            <span className="font-display text-[30px] font-extrabold leading-none">{counts[s]}</span>
          </button>
        ))}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search player or club" label="Search players" className="sm:w-80" />
        <Segmented
          label="Filter"
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: 'all', label: 'Everyone', count: players.length },
            { value: 'on_court', label: 'On court', count: counts.on_court },
            { value: 'resting', label: 'Resting', count: counts.resting },
            { value: 'ready', label: 'Free', count: counts.ready },
          ]}
        />
        <HelpTip label="Player statuses">
          <b>On court</b>: playing now. <b>Resting</b>: finished recently, needs {t.restMinutes} min before the next match. <b>Ready</b>:
          free to be called. <b>Waiting</b>: next opponent not known yet. <b>No more matches</b>: knocked out or finished.
        </HelpTip>
      </div>

      {shown.length === 0 ? (
        <Empty icon="users" title="No players here" body="Try another filter or search." />
      ) : (
        <ul className="grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((p) => (
            <PlayerRow key={p.id} lk={lk} tid={t.id} st={statuses.get(p.id)!} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlayerRow({ lk, tid, st, now }: { lk: Lookup; tid: string; st: PlayerStatus; now: number }) {
  const { openScore } = useAdmin();
  const p = lk.player(st.playerId)!;
  const info = STATE_INFO[st.state];
  const m = st.match;
  const ctx = m ? matchContext(lk, m) : undefined;
  const events = lk
    .entriesOfPlayer(p.id, tid)
    .map((e) => lk.event(e.eventId)!)
    .filter(Boolean);

  let detail: ReactNode = null;
  if (st.state === 'on_court' && m)
    detail = (
      <>
        Match #{m.number} on {lk.courtName(tid, m.courtId)} · {ctx?.ev.kind} {ctx?.short}
      </>
    );
  else if (st.state === 'resting' && m)
    detail = (
      <>
        Free in <span className="num font-semibold">{st.restLeft}</span> min · next: #{m.number} {ctx?.ev.kind} {ctx?.short}
      </>
    );
  else if (st.state === 'ready' && m)
    detail = (
      <>
        Can be called now · #{m.number} {ctx?.ev.kind} {ctx?.short}
      </>
    );
  else if (st.state === 'waiting' && m)
    detail = (
      <>
        Next: #{m.number} {ctx?.ev.kind} {ctx?.short}, opponent not decided
      </>
    );
  else detail = st.played ? 'All matches played' : 'No matches yet';

  return (
    <li className={cn('panel flex min-w-0 items-center gap-3 p-4', st.state === 'on_court' && 'border-live/50')}>
      <Avatar name={p.name} size={42} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-semibold">{p.name}</span>
          <span className="shrink-0 rounded-full bg-sunken px-1.5 text-[11px] font-bold text-muted" title={`Skill level ${p.level}`}>
            {p.level}
          </span>
        </div>
        <div className="truncate text-[12.5px] text-muted">
          {p.club} · {st.played} played{st.lastFinishedAt ? ` · last finished ${fmtAgo(st.lastFinishedAt, now)}` : ''}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Pill tone={info.tone}>
            {st.state === 'on_court' ? <LiveDot /> : <Icon name={info.icon} size={13} />} {info.label}
          </Pill>
          {m && st.state === 'on_court' && <DurationTag m={m} size="sm" />}
          {events.map((e) => (
            <EventChip key={e.id} kind={e.kind} />
          ))}
        </div>
        <div className="mt-1 truncate text-[13px] text-muted">{detail}</div>
      </div>
      {st.state === 'on_court' && m && (
        <Button size="sm" onClick={() => openScore(m.id)}>
          Score
        </Button>
      )}
    </li>
  );
}
