import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { useParams } from 'react-router';

import { type PlayerState, type PlayerStatus, playerStatuses } from '@/engine/scheduler';

import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/cn';
import { fmtAgo, fmtTime } from '@/lib/format';

import { type Lookup, useLookup } from '@/data/lookup';
import { tournamentPlayers, useCheckInMarks } from '@/data/queries';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';
import type { CheckIn } from '@/data/types';

import { useAuth } from '@/auth/authStore';

import { DurationTag } from '@/components/match/Duration';
import { matchContext } from '@/components/match/matchInfo';
import { NotFound } from '@/components/NotFound';
import { EventChip, LiveDot, Pill } from '@/components/tournament/Badges';
import { CheckInMark } from '@/components/tournament/CheckInName';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { HelpTip } from '@/components/ui/HelpTip';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { Segmented } from '@/components/ui/Tabs';
import { useConfirm } from '@/components/ui/useConfirm';

import { useAdmin } from '@/features/admin/adminContext';

const STATE_INFO: Record<PlayerState, { label: string; tone: 'live' | 'warn' | 'info' | 'muted' | 'ok'; icon: IconName; order: number }> = {
  on_court: { label: 'On court', tone: 'live', icon: 'location', order: 0 },
  resting: { label: 'Resting', tone: 'warn', icon: 'timer', order: 1 },
  ready: { label: 'Ready', tone: 'ok', icon: 'check', order: 2 },
  waiting: { label: 'Waiting', tone: 'info', icon: 'clock', order: 3 },
  done: { label: 'No more matches', tone: 'muted', icon: 'trophy', order: 4 },
};

type Arrival = 'all' | 'waiting' | 'in';

/** Every player: check them in as they arrive, then see who's on court, resting or free. */
export function LivePlayers() {
  const { tid } = useParams();
  const lk = useLookup();
  const t = lk.tournament(tid);
  const now = useNow(15000);
  const entries = useStore((s) => s.entries);
  const marks = useCheckInMarks(t);
  const setCheckedIn = useStore((s) => s.setCheckedIn);
  const clearCheckIns = useStore((s) => s.clearCheckIns);
  const me = useAuth((s) => s.user?.id);
  const { ask, dialog } = useConfirm();
  const [filter, setFilter] = useState<PlayerState | 'all'>('all');
  const [arrival, setArrival] = useState<Arrival>('all');
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
  const isIn = (id: string) => !!marks?.has(id);
  const arrived = marks ? players.filter((p) => isIn(p.id)).length : 0;
  const pct = players.length ? Math.round((arrived / players.length) * 100) : 0;
  const query = q.trim().toLowerCase();
  const matching = players.filter((p) => !query || `${p.name} ${p.club}`.toLowerCase().includes(query));
  const shown = matching
    .filter((p) => filter === 'all' || statuses.get(p.id)!.state === filter)
    .filter((p) => !marks || arrival === 'all' || (arrival === 'in') === isIn(p.id))
    .sort((a, b) =>
      // checking in at the door: an alphabetical list is quickest to scan
      arrival === 'waiting'
        ? a.name.localeCompare(b.name)
        : STATE_INFO[statuses.get(a.id)!.state].order - STATE_INFO[statuses.get(b.id)!.state].order || a.name.localeCompare(b.name),
    );

  const toggle = (id: string, on: boolean) => {
    const p = lk.player(id);
    setCheckedIn(t.id, [id], on, me);
    toast(on ? `${p?.name} checked in` : `${p?.name} is no longer checked in`, { tone: on ? undefined : 'info' });
  };

  // Enter in the search box checks in the only player found who isn't in yet
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const waiting = matching.filter((p) => !isIn(p.id));
    if (marks && query && waiting.length === 1) {
      toggle(waiting[0].id, true);
      setQ('');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t.name}
        title="Players"
        description={
          marks
            ? "Check players in as they arrive, then follow who's on court, resting or free. The desk won't let you call a player who is already playing."
            : "Who's on court, who's resting and who's free. Check-in opens when registration closes."
        }
      />

      {marks && (
        <section className="panel flex flex-col gap-3 p-4 sm:p-5" aria-label="Check-in">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-[14px] text-muted">
              <span className="num font-display text-[26px] font-extrabold leading-none text-fg">{arrived}</span>
              <span>
                of <span className="num">{players.length}</span> players checked in
              </span>
              {arrived < players.length && (
                <span>
                  · <span className="num">{players.length - arrived}</span> still to arrive
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Check-in"
                value={arrival}
                onChange={setArrival}
                size="sm"
                options={[
                  { value: 'all', label: 'All', count: players.length },
                  { value: 'waiting', label: 'Not here yet', count: players.length - arrived },
                  { value: 'in', label: 'Checked in', count: arrived },
                ]}
              />
              {arrived > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Icon name="refresh" size={16} />}
                  onClick={() =>
                    ask({
                      title: 'Start check-in for a new day?',
                      body: 'Everyone goes back to not checked in, so you can check players in again as they arrive.',
                      warning: `${arrived} ${arrived === 1 ? 'check-in' : 'check-ins'} will be cleared.`,
                      confirmLabel: 'Clear check-ins',
                      danger: true,
                      onConfirm: () => {
                        clearCheckIns(t.id);
                        toast('Check-ins cleared');
                      },
                    })
                  }
                >
                  New day
                </Button>
              )}
            </div>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-sunken"
            role="progressbar"
            aria-label="Players checked in"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-ok transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CheckInMark checkedIn /> Checked in
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckInMark checkedIn={false} /> Not here yet
            </span>
            <span>Type a name and press Enter to check them in.</span>
          </p>
        </section>
      )}

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
        <form onSubmit={submit} role="search" aria-label="Find a player" className="sm:w-80">
          <SearchInput value={q} onChange={setQ} placeholder="Search player or club" label="Search players" />
        </form>
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
        <Empty
          icon="users"
          title={arrival === 'waiting' && !query && filter === 'all' ? 'Everyone is here' : 'No players here'}
          body={arrival === 'waiting' && !query && filter === 'all' ? 'Every player has checked in.' : 'Try another filter or search.'}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((p) => (
            <PlayerRow
              key={p.id}
              lk={lk}
              tid={t.id}
              st={statuses.get(p.id)!}
              now={now}
              checkIn={marks ? (marks.get(p.id) ?? null) : undefined}
              onCheckIn={(on) => toggle(p.id, on)}
            />
          ))}
        </ul>
      )}
      {dialog}
    </div>
  );
}

function PlayerRow({
  lk,
  tid,
  st,
  now,
  checkIn,
  onCheckIn,
}: {
  lk: Lookup;
  tid: string;
  st: PlayerStatus;
  now: number;
  /** undefined: check-in not in use · null: not checked in yet */
  checkIn: CheckIn | null | undefined;
  onCheckIn: (on: boolean) => void;
}) {
  const { openScore } = useAdmin();
  const [open, setOpen] = useState(false);
  const p = lk.player(st.playerId)!;
  const marks = checkIn !== undefined;
  const here = checkIn !== null;
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

  const detailsId = `player-${p.id}-details`;
  return (
    <li
      className={cn(
        'panel flex min-w-0 flex-col p-3 sm:p-4',
        st.state === 'on_court' ? 'border-live/50' : !here && 'border-dashed border-warn/60',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* the narrowest phones give the room to the name: the desk checks people in by it */}
        <Avatar name={p.name} size={38} className="hidden xs:inline-flex" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2 sm:items-center">
            {marks && <CheckInMark checkedIn={here} />}
            <span className={cn('min-w-0 break-words text-[15px] font-semibold leading-snug sm:truncate', !here && 'text-muted')}>
              {p.name}
            </span>
            <span className="shrink-0 rounded-full bg-sunken px-1.5 text-[11px] font-bold text-muted" title={`Skill level ${p.level}`}>
              {p.level}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Pill tone={info.tone}>
              {st.state === 'on_court' ? <LiveDot /> : <Icon name={info.icon} size={13} />} {info.label}
            </Pill>
            {m && st.state === 'on_court' && <DurationTag m={m} size="sm" />}
            {events.map((e) => (
              <EventChip key={e.id} kind={e.kind} />
            ))}
          </div>
        </div>
        {!here ? (
          <Button size="sm" variant="primary" aria-label={`Check in ${p.name}`} onClick={() => onCheckIn(true)}>
            Check in
          </Button>
        ) : (
          st.state === 'on_court' &&
          m && (
            <Button size="sm" onClick={() => openScore(m.id)}>
              Score
            </Button>
          )
        )}
        <IconButton
          size="sm"
          label={open ? `Hide details for ${p.name}` : `Show details for ${p.name}`}
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? 'up' : 'down'} size={18} />
        </IconButton>
      </div>
      {open && (
        <dl id={detailsId} className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-line pt-3 text-[13px]">
          {marks && (
            <>
              <dt className="text-muted">Check-in</dt>
              <dd className={cn('flex min-w-0 flex-wrap items-center gap-x-2 font-medium', here ? 'text-ok' : 'text-warn')}>
                {checkIn ? `Checked in ${fmtTime(checkIn.at)}` : 'Not checked in yet'}
                {checkIn && (
                  <button
                    type="button"
                    className="tap-target rounded-full font-semibold text-muted underline-offset-2 hover:text-fg hover:underline"
                    onClick={() => onCheckIn(false)}
                    aria-label={`Undo check-in for ${p.name}`}
                  >
                    Undo
                  </button>
                )}
              </dd>
            </>
          )}
          <dt className="text-muted">Club</dt>
          <dd className="min-w-0 truncate">{p.club || 'No club'}</dd>
          <dt className="text-muted">Played</dt>
          <dd className="min-w-0">
            <span className="num">{st.played}</span> {st.played === 1 ? 'match' : 'matches'}
            {st.lastFinishedAt ? ` · last finished ${fmtAgo(st.lastFinishedAt, now)}` : ''}
          </dd>
          <dt className="text-muted">Match</dt>
          <dd className="min-w-0">{detail}</dd>
        </dl>
      )}
    </li>
  );
}
