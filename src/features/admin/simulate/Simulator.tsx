import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useShallow } from 'zustand/react/shallow';

import { useLookup } from '@/data/lookup';
import { matchDayStats } from '@/data/simulate';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { NotFound } from '@/components/NotFound';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Segmented } from '@/components/ui/Tabs';
import { useConfirm } from '@/components/ui/useConfirm';

const SPEEDS = [
  { value: '4000', label: 'Steady' },
  { value: '1500', label: 'Fast' },
  { value: '400', label: 'Very fast' },
];

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <li className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5">
      <span
        className={`num grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${done ? 'bg-fg text-bg' : 'bg-primary text-primary-fg'}`}
      >
        {done ? <Icon name="check" size={16} strokeWidth={2.6} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <h2 className="font-display text-[18px] font-bold">{title}</h2>
        {children}
      </div>
    </li>
  );
}

/**
 * Test runs: take a tournament from registration to the final in minutes. Uses the same actions as
 * the desk (close registration, draws, court calls, results), so every screen and notification updates
 * live — open the public page in another tab to watch.
 */
export function Simulator() {
  const { tid } = useParams();
  const lk = useLookup();
  const t = lk.tournament(tid);
  const store = useStore.getState();
  const live$ = useStore(useShallow((s) => ({ events: s.events, matches: s.matches })));
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState('1500');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { ask, dialog } = useConfirm();

  const stats = t ? matchDayStats(live$ as Parameters<typeof matchDayStats>[0], t.id) : null;
  const done = !!stats && stats.total > 0 && stats.finished === stats.total;

  useEffect(() => {
    if (!auto || !t) return;
    timer.current = setInterval(() => {
      const r = useStore.getState().simulateTick(t.id);
      if (!r.finished.length && !r.called.length) {
        setAuto(false);
        toast('Simulation finished', { detail: 'Every match that could be played has a result.' });
      }
    }, Number(speed));
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [auto, speed, t]);

  if (!t || !stats) return <NotFound what="tournament" />;
  const events = lk.eventsOf(t.id);
  const pending = events.flatMap((e) => lk.entriesOf(e.id)).filter((e) => e.status === 'pending');
  const drawn = events.filter((e) => e.drawState === 'published').length;
  const regOpen = t.status === 'registration' || t.status === 'draft';
  const allDrawn = drawn === events.length && events.length > 0;
  const live = t.status === 'live';

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        eyebrow={t.name}
        title="Simulator"
        description="Run the tournament end to end to test it. Players, courts and the public pages update as it plays."
        actions={
          <ButtonLink to={`/t/${t.slug}`} target="_blank" rel="noreferrer" icon={<Icon name="external" size={17} />}>
            Open the player view
          </ButtonLink>
        }
      />
      <div className="flex flex-col gap-3 rounded-xl bg-warn-soft p-3.5 text-[13.5px] font-medium text-warn sm:flex-row sm:items-center">
        <p className="flex flex-1 items-start gap-2">
          <Icon name="alert" size={17} className="mt-0.5 shrink-0" />
          Simulated results are saved like real ones. Reset the test run to start again from open registration.
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          icon={<Icon name="refresh" size={16} />}
          onClick={() =>
            ask({
              title: 'Reset the test run?',
              body: `${t.name} goes back to open registration. Draws and results are removed; entries stay.`,
              warning: "Simulated and real results in this tournament are deleted. This can't be undone.",
              confirmLabel: 'Reset test run',
              danger: true,
              onConfirm: () => {
                setAuto(false);
                store.resetDraws(t.id);
                toast('Test run reset', { tone: 'info', detail: 'Registration is open again.' });
              },
            })
          }
        >
          Reset test run
        </Button>
      </div>
      {dialog}

      <ol className="flex flex-col gap-3">
        <Step n={1} title="Close registration" done={!regOpen}>
          <p className="text-[14px] text-muted">
            {pending.length > 0 ? `${pending.length} entries are still waiting for confirmation. ` : 'All entries are confirmed. '}
            {regOpen ? 'Closing freezes the entry list.' : 'Registration is closed.'}
          </p>
          {regOpen && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  pending.forEach((e) => store.setEntryStatus(e.id, 'accepted'));
                  store.setStage(t.id, 'closed');
                  toast('Entries confirmed and registration closed');
                }}
              >
                Confirm entries and close
              </Button>
            </div>
          )}
        </Step>

        <Step n={2} title="Make the draws" done={allDrawn}>
          <p className="text-[14px] text-muted">
            <span className="num">
              {drawn}/{events.length}
            </span>{' '}
            draws published. The app ranks entries by level, seeds the strongest, pairs A against C and B against D in round one, and keeps
            clubmates apart.
          </p>
          {!allDrawn && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={regOpen}
                onClick={() => {
                  const n = store.drawAllEvents(t.id);
                  toast(`${n} draws published`);
                }}
              >
                Make all draws
              </Button>
              <ButtonLink to={`/admin/t/${t.id}/draws`} variant="secondary">
                Draw them one by one
              </ButtonLink>
            </div>
          )}
        </Step>

        <Step n={3} title="Start match day" done={live || t.status === 'completed'}>
          <p className="text-[14px] text-muted">
            Going live lets players follow the courts. The first matches are called as courts free up.
          </p>
          {!live && t.status !== 'completed' && (
            <Button variant="primary" disabled={!allDrawn} className="self-start" onClick={() => store.setStage(t.id, 'live')}>
              Go live
            </Button>
          )}
        </Step>

        <Step n={4} title="Play matches" done={done}>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[13.5px]">
              <span>
                <span className="num font-semibold">{stats.finished}</span> of <span className="num">{stats.total}</span> played
              </span>
              <span className="text-muted">
                <span className="num">{stats.onCourt}</span> on court · <span className="num">{stats.ready}</span> ready ·{' '}
                <span className="num">{stats.pending}</span> waiting
              </span>
            </div>
            <ProgressBar value={stats.finished} max={Math.max(1, stats.total)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={auto ? 'danger' : 'primary'}
              disabled={!live || done}
              icon={<Icon name={auto ? 'close' : 'live'} size={18} />}
              onClick={() => setAuto((a) => !a)}
            >
              {auto ? 'Pause' : 'Auto-play'}
            </Button>
            <Segmented label="Speed" size="sm" value={speed} onChange={setSpeed} options={SPEEDS} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!live || done}
              onClick={() => {
                const r = store.simulateTick(t.id);
                toast(r.finished.length ? 'Result saved' : 'Matches called', { tone: 'info' });
              }}
            >
              Next result
            </Button>
            <Button variant="secondary" disabled={!live || done} onClick={() => store.simulateMatches(t.id, 10)}>
              Play 10 matches
            </Button>
            <Button
              variant="secondary"
              disabled={!live || done}
              onClick={() => {
                const r = store.simulateMatches(t.id, 10_000);
                toast(`${r.finished.length} matches played`);
              }}
            >
              Play everything
            </Button>
          </div>
        </Step>

        <Step n={5} title="Finish" done={t.status === 'completed'}>
          <p className="text-[14px] text-muted">Mark the tournament finished once the finals are in. Results stay public.</p>
          {t.status !== 'completed' && (
            <Button variant="secondary" disabled={!live} className="self-start" onClick={() => store.setStage(t.id, 'completed')}>
              Finish tournament
            </Button>
          )}
        </Step>
      </ol>
    </div>
  );
}
