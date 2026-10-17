import type { ReactNode } from 'react';

import type { Tournament } from '@/engine/types';

import { useLookup } from '@/data/lookup';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { useAuth } from '@/auth/authStore';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SectionHead } from '@/components/ui/Section';
import { useConfirm } from '@/components/ui/useConfirm';

/** Tournament-wide resets, each behind a confirmation: results, draws, and (demo only) everything. */
export function ResetSection({ t }: { t: Tournament }) {
  const lk = useLookup();
  const resetResults = useStore((s) => s.resetResults);
  const resetDraws = useStore((s) => s.resetDraws);
  const renumber = useStore((s) => s.renumberMatches);
  const resetDemo = useStore((s) => s.resetDemo);
  const demo = useAuth((s) => s.backend?.kind === 'demo');
  const { ask, dialog } = useConfirm();

  const matches = lk.matchesOf(t.id).filter((m) => m.status !== 'bye' && m.number > 0);
  const results = matches.filter((m) => m.status === 'finished' || m.status === 'on_court' || m.games.length).length;
  const drawn = lk.eventsOf(t.id).filter((e) => e.drawState === 'published').length;
  // already 1, 2, 3 … with no gaps?
  const numbers = matches.map((m) => m.number).sort((a, b) => a - b);
  const tidy = numbers.every((n, i) => n === i + 1);

  const row = (title: string, body: ReactNode, button: ReactNode) => (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold">{title}</div>
        <div className="text-[13px] text-muted">{body}</div>
      </div>
      <div className="shrink-0">{button}</div>
    </li>
  );

  return (
    <section aria-labelledby="set-reset">
      <SectionHead
        title={<span id="set-reset">Reset</span>}
        description="For test runs and fresh starts. Each one asks you to confirm first."
      />
      <ul className="panel divide-y divide-line">
        {row(
          'Clear all results',
          <>
            Every match goes back to not played; the draws stay. <span className="num">{results}</span>{' '}
            {results === 1 ? 'match is' : 'matches are'} played or on court now.
          </>,
          <Button
            size="sm"
            icon={<Icon name="undo" size={16} />}
            disabled={!results}
            onClick={() =>
              ask({
                title: `Clear every result in ${t.name}?`,
                body: 'All matches go back to not played and the tournament returns to the draws stage. Draws and match numbers stay.',
                warning: `${results} ${results === 1 ? 'match goes' : 'matches go'} back to not played, and their scores are deleted. This can't be undone.`,
                confirmLabel: 'Clear all results',
                danger: true,
                onConfirm: () => {
                  resetResults(t.id);
                  toast('All results cleared', { tone: 'info', detail: 'Start match day again when you are ready.' });
                },
              })
            }
          >
            Clear results
          </Button>,
        )}
        {row(
          'Renumber matches from 1',
          <>
            Match numbers and score slips run 1, 2, 3 … again with no gaps; each event keeps its order.{' '}
            {matches.length ? (
              <>
                Now <span className="num">#{numbers[0]}</span> to <span className="num">#{numbers[numbers.length - 1]}</span>
                {tidy ? ', already in order.' : '.'}
              </>
            ) : (
              'No matches yet.'
            )}
          </>,
          <Button
            size="sm"
            icon={<Icon name="refresh" size={16} />}
            disabled={!matches.length || tidy}
            onClick={() =>
              ask({
                title: `Renumber the matches in ${t.name} from 1?`,
                body: `Matches become #1 to #${matches.length}, in the same order. Results, courts and draws stay.`,
                warning: 'Score slips you already printed or handed out show the old numbers: print them again.',
                confirmLabel: 'Renumber matches',
                onConfirm: () => {
                  renumber(t.id);
                  toast('Matches renumbered from 1', { detail: 'Print the score slips again.' });
                },
              })
            }
          >
            Renumber
          </Button>,
        )}
        {row(
          'Back to registration',
          <>
            Removes every draw and result and reopens registration. Entries stay. <span className="num">{drawn}</span>{' '}
            {drawn === 1 ? 'event is' : 'events are'} drawn now.
          </>,
          <Button
            size="sm"
            icon={<Icon name="refresh" size={16} />}
            disabled={!drawn && t.status === 'registration'}
            onClick={() =>
              ask({
                title: `Take ${t.name} back to registration?`,
                body: 'Every draw is removed and registration opens again. Entries, players and settings stay.',
                warning: results
                  ? `${drawn} ${drawn === 1 ? 'draw' : 'draws'} and the scores of ${results} ${results === 1 ? 'match' : 'matches'} will be deleted. This can't be undone.`
                  : `${drawn} ${drawn === 1 ? 'draw' : 'draws'} will be deleted. This can't be undone.`,
                confirmLabel: 'Reset to registration',
                danger: true,
                onConfirm: () => {
                  resetDraws(t.id);
                  toast(`${t.name} is back to registration`, { tone: 'info' });
                },
              })
            }
          >
            Reset to registration
          </Button>,
        )}
        {demo &&
          row(
            'Reset demo data',
            'Puts every tournament, entry and account back to the starting demo.',
            <Button
              size="sm"
              variant="danger"
              icon={<Icon name="refresh" size={16} />}
              onClick={() =>
                ask({
                  title: 'Reset all demo data?',
                  body: 'Every tournament goes back to the starting demo: entries, draws, results and messages.',
                  warning: "Everything you changed is lost. This can't be undone.",
                  confirmLabel: 'Reset demo data',
                  danger: true,
                  onConfirm: resetDemo,
                })
              }
            >
              Reset demo data
            </Button>,
          )}
      </ul>
      {dialog}
    </section>
  );
}
