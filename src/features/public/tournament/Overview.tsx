import { useState } from 'react';
import { Link } from 'react-router';

import { RULES } from '@/engine/rules';
import type { EventKind, Match } from '@/engine/types';

import { useNow } from '@/hooks/useNow';

import { useQueue } from '@/data/queries';
import { registrationOpen } from '@/data/registration';

import { CourtCard } from '@/components/match/CourtCard';
import { ResultLine } from '@/components/match/Match';
import { matchContext, sideName } from '@/components/match/matchInfo';
import { AnnouncementBanner } from '@/components/notices/Notices';
import { Pill } from '@/components/tournament/Badges';
import { EventCard } from '@/components/tournament/EventCard';
import { EVENT_NAME } from '@/components/tournament/labels';
import { Empty } from '@/components/ui/Empty';
import { Icon } from '@/components/ui/Icon';
import { SectionHead } from '@/components/ui/Section';
import { FilterChips } from '@/components/ui/Tabs';

import { ChampionsPanel, Following, RegistrationOverview } from '@/features/public/tournament/OverviewPanels';
import { useT } from '@/features/public/tournament/tournamentContext';
import { TournamentProgress } from '@/features/public/tournament/TournamentProgress';

export function Overview() {
  const { t, lk } = useT();
  const now = useNow();
  const queue = useQueue(lk, t, now);
  const [ev, setEv] = useState<EventKind | 'all'>('all');
  const events = lk.eventsOf(t.id);
  const kinds = [...new Set(events.map((e) => e.kind))];
  const byEvent = (m: Match) => ev === 'all' || lk.event(m.eventId)?.kind === ev;
  const matches = lk.matchesOf(t.id);
  const onCourt = t.courts
    .map((c) => ({ court: c, match: matches.find((m) => m.status === 'on_court' && m.courtId === c.id) }))
    .filter((x) => x.match && byEvent(x.match));
  const recent = matches
    .filter((m) => m.status === 'finished' && m.finishedAt && byEvent(m))
    .sort((a, b) => b.finishedAt! - a.finishedAt!)
    .slice(0, 6);

  // the event list with fees is only for entering; after that the page is about what's happening
  if (registrationOpen(t) || (t.status === 'registration' && !matches.length)) return <RegistrationOverview />;

  return (
    <div className="flex flex-col gap-6 sm:gap-6">
      <AnnouncementBanner tournamentId={t.id} />
      <Following />
      <TournamentProgress t={t} lk={lk} />

      {t.status === 'completed' && <ChampionsPanel />}

      {t.status === 'live' && (
        <>
          <FilterChips
            label="Filter by event"
            value={ev}
            onChange={setEv}
            options={[{ value: 'all' as const, label: 'All events' }, ...kinds.map((k) => ({ value: k, label: EVENT_NAME[k] }))]}
          />
          <section aria-label="On court now">
            <SectionHead
              title="On court now"
              action={
                <Link
                  to={`/t/${t.slug}/courts`}
                  className="inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold hover:underline"
                >
                  All courts <Icon name="right" size={16} />
                </Link>
              }
            />
            {onCourt.length ? (
              <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                {onCourt.map(({ court, match }) => (
                  <CourtCard key={court.id} lk={lk} court={court} match={match} now={now} />
                ))}
              </div>
            ) : (
              <Empty icon="location" title="Nothing on court for this event" body="The next matches will be called shortly." />
            )}
          </section>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <section className="panel min-w-0 py-2" aria-label="Up next">
              <h2 className="px-5 py-3 font-display text-[20px] font-bold">Up next</h2>
              <ol>
                {queue
                  .filter((q) => byEvent(q.match))
                  .slice(0, 6)
                  .map((q, i) => {
                    const c = matchContext(lk, q.match);
                    return (
                      <li key={q.match.id} className="flex items-center gap-4 border-t border-line px-5 py-3.5">
                        <span className="num w-8 shrink-0 text-[14px] font-semibold text-muted">{i + 1}.</span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-semibold">
                            {sideName(lk, q.match, 'a')} <span className="font-medium text-muted">vs</span> {sideName(lk, q.match, 'b')}
                          </span>
                          <span className="truncate text-[13px] text-muted">
                            {c.ev.name} · {c.label}
                          </span>
                        </span>
                        {q.resting ? (
                          <Pill tone="warn">Resting</Pill>
                        ) : q.blocked ? (
                          <Pill tone="muted">Busy</Pill>
                        ) : (
                          <Pill tone="info">Next</Pill>
                        )}
                      </li>
                    );
                  })}
              </ol>
              {queue.filter((q) => byEvent(q.match)).length === 0 && (
                <p className="border-t border-line px-5 py-4 text-[14px] text-muted">
                  Nothing waiting. Matches appear here once both players are known.
                </p>
              )}
            </section>
            <section className="panel min-w-0 py-2" aria-label="Latest results">
              <h2 className="px-5 py-3 font-display text-[20px] font-bold">Latest results</h2>
              <div className="divide-y divide-line border-t border-line px-5">
                {recent.map((m) => (
                  <ResultLine key={m.id} lk={lk} m={m} now={now} />
                ))}
              </div>
            </section>
          </div>
        </>
      )}

      <section aria-label="Events">
        <SectionHead title="Events" description="Tap an event to see its full draw." />
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((e) => (
            <EventCard key={e.id} lk={lk} t={t} ev={e} />
          ))}
        </div>
      </section>

      {t.about && (
        <section className="panel flex flex-col gap-2 p-4 sm:p-5">
          <h2 className="font-display text-[20px] font-bold">About this tournament</h2>
          <p className="max-w-[70ch] text-[15px] text-muted">{t.about}</p>
          <p className="text-[14px] text-muted">
            <span className="font-semibold text-fg">Scoring:</span> {RULES[t.rules].note}
          </p>
        </section>
      )}
    </div>
  );
}
