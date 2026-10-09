import { type ReactNode, useMemo, useState } from 'react';

import type { Match } from '@/engine/types';

import { useNow } from '@/hooks/useNow';

import { useQueue } from '@/data/queries';

import { MatchRow } from '@/components/match/Match';
import { Button } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { HelpTip } from '@/components/ui/HelpTip';
import { Icon } from '@/components/ui/Icon';
import { SectionHead } from '@/components/ui/Section';
import { FilterChips, Segmented } from '@/components/ui/Tabs';

import { useT } from '@/features/public/tournament/tournamentContext';

type View = 'now' | 'next' | 'later' | 'done';

const PAGE = 40;

export function Schedule() {
  const { t, lk } = useT();
  const now = useNow();
  const queue = useQueue(lk, t, now);
  const [view, setView] = useState<View>(t.status === 'completed' ? 'done' : 'now');
  const [eventId, setEventId] = useState<string>('all');
  const [limit, setLimit] = useState(PAGE);
  const events = lk.eventsOf(t.id);
  const all = lk.matchesOf(t.id).filter((m) => m.status !== 'bye');
  const filt = (ms: Match[]) => (eventId === 'all' ? ms : ms.filter((m) => m.eventId === eventId));

  const lists = useMemo(
    () => ({
      now: all
        .filter((m) => m.status === 'on_court')
        .sort((a, b) => (a.courtId ?? '').localeCompare(b.courtId ?? '', undefined, { numeric: true })),
      next: queue.map((q) => q.match),
      later: all.filter((m) => m.status === 'pending').sort((a, b) => a.number - b.number),
      done: all.filter((m) => m.status === 'finished').sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0)),
    }),
    [all, queue],
  );
  const shown = filt(lists[view]);

  const intro: Record<View, ReactNode> = {
    now: 'Matches being played right now, by court.',
    next: (
      <>
        In the order the desk will call them. Players get at least <span className="num">{t.restMinutes}</span> minutes of rest between
        matches.
      </>
    ),
    later: 'These matches are waiting on earlier results.',
    done: 'Most recent results first.',
  };

  const empty: Record<View, { title: string; body: string }> = {
    now: {
      title: 'No matches on court',
      body: t.status === 'live' ? 'Courts are being reset. Check Up next to see who plays soon.' : 'Matches show up here once play starts.',
    },
    next: { title: 'Nobody is waiting to be called', body: 'When a match is ready to go on court, it appears here.' },
    later: { title: 'Nothing waiting on results', body: 'Every remaining match already knows its players.' },
    done: { title: 'No results yet', body: 'Finished matches and scores appear here as soon as the desk enters them.' },
  };

  const changeView = (v: View) => {
    setView(v);
    setLimit(PAGE);
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionHead
        title={
          <span className="inline-flex items-center gap-1">
            Schedule
            {view === 'next' && (
              <HelpTip label="Up next">
                The desk calls matches in this order as courts free up. A player who just finished is moved back until their rest time is
                over.
              </HelpTip>
            )}
          </span>
        }
        description={intro[view]}
        className="mb-0"
      />

      <div className="flex flex-col gap-3">
        <Segmented
          label="Schedule view"
          value={view}
          onChange={changeView}
          className="self-start"
          options={[
            { value: 'now', label: 'On court', count: filt(lists.now).length },
            { value: 'next', label: 'Up next', count: filt(lists.next).length },
            { value: 'later', label: 'Later', count: filt(lists.later).length },
            { value: 'done', label: 'Finished', count: filt(lists.done).length },
          ]}
        />
        {events.length > 1 && (
          <FilterChips
            label="Filter by event"
            value={eventId}
            onChange={(v) => {
              setEventId(v);
              setLimit(PAGE);
            }}
            options={[{ value: 'all', label: 'All events' }, ...events.map((e) => ({ value: e.id, label: e.name }))]}
          />
        )}
      </div>

      {shown.length ? (
        <>
          <ol className="grid gap-2.5 lg:grid-cols-2">
            {shown.slice(0, limit).map((m, i) => (
              <li key={m.id} className="flex min-w-0 items-stretch gap-2.5">
                {view === 'next' && (
                  <span
                    className="num grid w-7 shrink-0 place-items-center text-[13px] font-semibold text-faint"
                    aria-label={`Number ${i + 1} in line`}
                  >
                    {i + 1}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <MatchRow lk={lk} m={m} now={now} to={`/t/${t.slug}/draws/${m.eventId}`} />
                </div>
              </li>
            ))}
          </ol>
          {shown.length > limit && (
            <div className="flex flex-col items-center gap-2 pt-1">
              <p className="text-[13px] text-muted">
                Showing <span className="num">{limit}</span> of <span className="num">{shown.length}</span> matches
              </p>
              <Button onClick={() => setLimit((l) => l + PAGE)} icon={<Icon name="down" size={18} />}>
                Show more
              </Button>
            </div>
          )}
        </>
      ) : (
        <Empty
          icon={view === 'done' ? 'trophy' : view === 'now' ? 'location' : 'clock'}
          title={empty[view].title}
          body={empty[view].body}
        />
      )}
    </div>
  );
}
