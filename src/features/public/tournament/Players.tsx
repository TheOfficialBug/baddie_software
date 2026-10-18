import { memo, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';

import type { Player, TEvent, Tournament } from '@/engine/types';

import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/cn';

import type { Lookup } from '@/data/lookup';
import { tournamentPlayers } from '@/data/queries';

import { MatchRow } from '@/components/match/Match';
import { NotFound } from '@/components/NotFound';
import { EventChip, FlightBadge, Pill } from '@/components/tournament/Badges';
import { Avatar } from '@/components/ui/Avatar';
import { Empty } from '@/components/ui/Empty';
import { Icon } from '@/components/ui/Icon';
import { SearchInput } from '@/components/ui/SearchInput';
import { SectionHead } from '@/components/ui/Section';

import { eventStatus } from '@/features/public/tournament/eventStatus';
import { useT } from '@/features/public/tournament/tournamentContext';

const letterOf = (p: Player) => (p.name.trim()[0] ?? '#').toUpperCase();
const letterId = (l: string) => `players-${l}`;

export function PlayersIndex() {
  const { t, lk } = useT();
  const [q, setQ] = useState('');
  const all = useMemo(() => tournamentPlayers(lk, t), [lk, t]);
  const query = q.trim().toLowerCase();
  const list = query ? all.filter((p) => `${p.name} ${p.club}`.toLowerCase().includes(query)) : all;
  const byLetter = useMemo(() => {
    const m = new Map<string, Player[]>();
    list.forEach((p) => m.set(letterOf(p), [...(m.get(letterOf(p)) ?? []), p]));
    return [...m.entries()];
  }, [list]);

  const jump = (l: string) => document.getElementById(letterId(l))?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="flex flex-col gap-5">
      <SectionHead
        title="Players"
        description={<>Find anyone entered in {t.name} to see their events, next match and results.</>}
        className="mb-0"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search by name or club" label="Search players" className="w-full sm:max-w-md" />
        <p className="text-[13px] text-muted sm:ml-auto" aria-live="polite">
          {query ? (
            <>
              <span className="num font-semibold text-fg">{list.length}</span> of <span className="num">{all.length}</span> players
            </>
          ) : (
            <>
              <span className="num font-semibold text-fg">{all.length}</span> players entered
            </>
          )}
        </p>
      </div>

      {byLetter.length > 6 && (
        <nav aria-label="Jump to letter" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {byLetter.map(([l]) => (
            <button
              key={l}
              type="button"
              onClick={() => jump(l)}
              className="grid h-10 min-w-10 shrink-0 place-items-center rounded-full border border-line bg-surface px-2 text-[13px] font-semibold text-muted transition-colors hover:border-fg/50 hover:text-fg"
            >
              {l}
            </button>
          ))}
        </nav>
      )}

      {list.length === 0 && (
        <Empty
          icon="search"
          title="No players found"
          body={
            query
              ? `Nobody matches “${q.trim()}”. Check the spelling, or try a club name.`
              : 'Players appear here once their entries are accepted.'
          }
        />
      )}

      <div className="flex flex-col gap-6">
        {byLetter.map(([letter, ps]) => (
          <section key={letter} id={letterId(letter)} className="scroll-mt-32" aria-label={`Players starting with ${letter}`}>
            <div className="mb-2.5 flex items-center gap-3">
              <span className="font-display text-[22px] font-extrabold leading-none">{letter}</span>
              <span className="h-px flex-1 bg-line" aria-hidden />
              <span className="num text-[12px] text-faint">{ps.length}</span>
            </div>
            <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {ps.map((p) => (
                <PlayerCard key={p.id} p={p} slug={t.slug} events={lk.entriesOfPlayer(p.id, t.id).map((e) => lk.event(e.eventId)!)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

// a live point elsewhere re-renders the index; a card only when its player or their events change
const PlayerCard = memo(
  function PlayerCard({ p, slug, events }: { p: Player; slug: string; events: TEvent[] }) {
    return (
      <li className="min-w-0">
        <Link
          to={`/t/${slug}/players/${p.id}`}
          className="flex min-h-[64px] min-w-0 items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 transition-colors hover:border-fg/40"
        >
          <Avatar name={p.name} size={40} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{p.name}</div>
            <div className="truncate text-[13px] text-muted">{p.club}</div>
          </div>
          <div className="flex shrink-0 gap-1">
            {events.slice(0, 3).map((ev) => (
              <EventChip key={ev.id} kind={ev.kind} />
            ))}
            {events.length > 3 && <span className="num self-center text-[12px] text-muted">+{events.length - 3}</span>}
          </div>
        </Link>
      </li>
    );
  },
  (a, b) => a.p === b.p && a.slug === b.slug && a.events.length === b.events.length && a.events.every((ev, i) => ev === b.events[i]),
);

export function PlayerPage() {
  const { t, lk } = useT();
  const { playerId } = useParams();
  const p = lk.player(playerId);
  if (!p) return <NotFound what="player" />;
  return <PlayerDetail t={t} lk={lk} p={p} back />;
}

export function PlayerDetail({
  t,
  lk,
  p,
  back,
  header = true,
}: {
  t: Tournament;
  lk: Lookup;
  p: Player;
  back?: boolean;
  header?: boolean;
}) {
  const now = useNow();
  const entries = lk.entriesOfPlayer(p.id, t.id);
  const matches = lk
    .matchesOf(t.id)
    .filter((m) => m.status !== 'bye' && m.number > 0 && [m.a, m.b].some((e) => lk.entry(e)?.playerIds.includes(p.id)));
  const upcoming = matches
    .filter((m) => m.status === 'on_court' || m.status === 'ready')
    .sort((a, b) => (a.status === 'on_court' ? -1 : 0) - (b.status === 'on_court' ? -1 : 0) || a.number - b.number);
  const done = matches.filter((m) => m.status === 'finished').sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  const won = done.filter((m) => m.winner && lk.entry(m[m.winner])?.playerIds.includes(p.id)).length;
  const onCourt = upcoming.some((m) => m.status === 'on_court');

  return (
    <div className="flex flex-col gap-6">
      {header && (
        <div className="flex flex-col gap-4">
          {back && (
            <Link
              to={`/t/${t.slug}/players`}
              className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-full pl-1 pr-3 text-[14px] font-semibold text-muted transition-colors hover:text-fg"
            >
              <Icon name="left" size={18} /> All players
            </Link>
          )}
          <div className="panel flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-5">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <Avatar name={p.name} size={64} />
              <div className="min-w-0">
                <h2 className="font-display text-[clamp(26px,4vw,36px)] font-extrabold leading-[1.05]">{p.name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-muted">
                  <span className="truncate">{p.club}</span>
                  {onCourt && (
                    <Pill tone="live">
                      <Icon name="live" size={14} /> On court now
                    </Pill>
                  )}
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 sm:w-auto sm:min-w-[300px]">
              {[
                { k: 'Events', v: entries.length },
                { k: 'Won', v: won },
                { k: 'Lost', v: done.length - won },
              ].map(({ k, v }) => (
                <div key={k} className="rounded-xl bg-sunken px-3 py-2.5">
                  <dt className="eyebrow text-[11px]">{k}</dt>
                  <dd className="num mt-0.5 text-[22px] font-semibold leading-none">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      <section>
        <SectionHead title="Events" description={entries.length ? undefined : 'Not entered in any events yet.'} />
        {entries.length > 0 && (
          <ul className="grid gap-2.5 md:grid-cols-2">
            {entries.map((e) => {
              const ev = lk.event(e.eventId)!;
              const st = eventStatus(lk, ev, p.id);
              const partner = e.playerIds.filter((x) => x !== p.id).map((x) => lk.player(x)?.name)[0];
              const live = st.next?.status === 'on_court';
              return (
                <li key={e.id} className="min-w-0">
                  <Link
                    to={`/t/${t.slug}/draws/${ev.id}`}
                    className="panel flex min-h-[72px] min-w-0 items-center gap-3 p-4 transition-colors hover:border-fg/40"
                  >
                    <EventChip kind={ev.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{ev.name}</div>
                      {partner && <div className="truncate text-[13px] text-muted">with {partner}</div>}
                      <div className={cn('mt-0.5 flex items-center gap-1.5 text-[13px]', live ? 'font-semibold text-live' : 'text-muted')}>
                        {e.status === 'pending' ? (
                          <>
                            <Icon name="clock" size={14} /> Entry waiting for the organizer to confirm
                          </>
                        ) : (
                          <span className="truncate">{st.text}</span>
                        )}
                      </div>
                    </div>
                    {st.flight && <FlightBadge flight={st.flight} />}
                    <Icon name="right" size={18} className="text-faint" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {upcoming.length > 0 && (
        <section>
          <SectionHead title="Next up" description="Your name is highlighted. Head to the court when the desk calls you." />
          <div className="grid gap-2.5 lg:grid-cols-2">
            {upcoming.map((m) => (
              <MatchRow key={m.id} lk={lk} m={m} now={now} highlight={p.id} to={`/t/${t.slug}/draws/${m.eventId}`} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead title="Results" description={done.length ? `${won} won, ${done.length - won} lost` : undefined} />
        {done.length ? (
          <div className="grid gap-2.5 lg:grid-cols-2">
            {done.map((m) => (
              <MatchRow key={m.id} lk={lk} m={m} now={now} highlight={p.id} to={`/t/${t.slug}/draws/${m.eventId}`} />
            ))}
          </div>
        ) : (
          <Empty icon="trophy" title="No matches played yet" body="Scores show up here as soon as the desk enters them." />
        )}
      </section>
    </div>
  );
}
