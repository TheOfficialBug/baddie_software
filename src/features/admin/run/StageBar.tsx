import type { ReactNode } from 'react';

import type { Tournament } from '@/engine/types';

import { cn } from '@/lib/cn';

import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { useAccess } from '@/auth/useAccess';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useConfirm } from '@/components/ui/useConfirm';

import { PublishButton } from '@/features/admin/PublishButton';
import { type Progress, type StageIndex, STAGES } from '@/features/admin/run/stages';

/**
 * The tournament's stages as one row of steps, with the single next step underneath.
 * Done steps can be opened again to look back (add a late entry, check a draw).
 */
export function StageBar({
  t,
  p,
  current,
  view,
  onView,
}: {
  t: Tournament;
  p: Progress;
  current: StageIndex;
  view: StageIndex;
  onView: (i: StageIndex) => void;
}) {
  const access = useAccess();
  const setStage = useStore((s) => s.setStage);
  const drawAll = useStore((s) => s.drawAllEvents);
  const { ask, dialog } = useConfirm();
  const canStage = access.can('manage_settings', t.organizationId);
  const canDraw = access.can('manage_draws', t.organizationId);

  const summary = [
    t.status === 'draft' ? 'Not open yet' : `${p.accepted} entries${p.pending.length ? ` · ${p.pending.length} new` : ''}`,
    p.events.length ? `${p.drawn.length}/${p.events.length} drawn` : 'No events',
    p.matches ? `${p.played}/${p.matches} played` : 'After the draws',
    t.status === 'completed' ? 'Results are final' : 'Winners',
  ];

  // The one thing to do next at the current stage.
  let next: { text: ReactNode; action?: ReactNode } = { text: '' };
  if (t.status === 'draft' && p.events.length && p.drawn.length === p.events.length)
    next = {
      text: "The draws are in. Players can't see this tournament yet: check the draws, then publish.",
      action: <PublishButton t={t} canPublish={canStage} />,
    };
  else if (t.status === 'draft')
    next = {
      text: "Players can't see this tournament yet. Open registration when you're ready for entries.",
      action: canStage && (
        <Button variant="primary" icon={<Icon name="userAdd" size={18} />} onClick={() => setStage(t.id, 'registration')}>
          Open registration
        </Button>
      ),
    };
  else if (t.status === 'registration')
    next = {
      text: p.pending.length
        ? `${p.pending.length} new ${p.pending.length === 1 ? 'entry needs' : 'entries need'} confirming below. When entries are in, close registration to make the draws.`
        : 'Entries come in as players register. When you are ready, close registration to make the draws.',
      action: canStage && (
        <Button
          variant="primary"
          icon={<Icon name="lock" size={18} />}
          onClick={() =>
            ask({
              title: 'Close registration?',
              body: 'Players can no longer enter, and everyone is told the draws are being made. You can reopen it later if nothing is drawn yet.',
              warning: p.pending.length
                ? `${p.pending.length} new ${p.pending.length === 1 ? 'entry is' : 'entries are'} not confirmed and won't be in the draws.`
                : undefined,
              confirmLabel: 'Close registration',
              onConfirm: () => {
                setStage(t.id, 'closed');
                toast('Registration closed', { detail: 'Players were notified. Make the draws next.' });
              },
            })
          }
        >
          Close registration
        </Button>
      ),
    };
  else if (t.status === 'closed') {
    if (p.drawable.length)
      next = {
        text: `${p.drawable.length} ${p.drawable.length === 1 ? 'event needs' : 'events need'} a draw. Draw them all with the standard settings (seeded by level, clubmates apart), or one at a time below.`,
        action: canDraw && (
          <Button
            variant="primary"
            icon={<Icon name="shuffle" size={18} />}
            onClick={() => {
              const n = drawAll(t.id);
              toast(`${n} draw${n === 1 ? '' : 's'} published`, { detail: 'Players can see who they play.' });
            }}
          >
            Draw all {p.drawable.length}
          </Button>
        ),
      };
    else if (p.drawn.length)
      next = {
        text: 'Every draw is out. Start match day when players arrive; matches are then ready to send to courts.',
        action: canStage && (
          <Button
            variant="primary"
            icon={<Icon name="live" size={18} />}
            onClick={() => {
              setStage(t.id, 'live');
              toast(`${t.name} is live`, { detail: 'Fill the courts to call the first matches.' });
            }}
          >
            Start match day
          </Button>
        ),
      };
    else next = { text: 'No event has 2 confirmed entries yet, so there is nothing to draw.' };
  } else if (t.status === 'live')
    next = p.left
      ? {
          text: 'Fill free courts, then type scores from the slips as they come back. Winners move on by themselves.',
          action: canStage && (
            <Button
              variant="ghost"
              onClick={() =>
                ask({
                  title: 'Finish the tournament early?',
                  body: 'Results become final and players are told the tournament is over. You can reopen match day afterwards.',
                  warning: `${p.left} ${p.left === 1 ? 'match has' : 'matches have'} not been played.`,
                  confirmLabel: 'Finish tournament',
                  danger: true,
                  onConfirm: () => {
                    setStage(t.id, 'completed');
                    toast('Tournament finished');
                  },
                })
              }
            >
              Finish early
            </Button>
          ),
        }
      : {
          text: 'Every match is played. Finish the tournament to make the results final.',
          action: canStage && (
            <Button
              variant="primary"
              icon={<Icon name="trophy" size={18} />}
              onClick={() => {
                setStage(t.id, 'completed');
                toast('Tournament finished', { detail: 'Players were notified.' });
              }}
            >
              Finish tournament
            </Button>
          ),
        };
  else
    next = {
      text: 'Results are final and public.',
      action: canStage && (
        <Button variant="ghost" onClick={() => setStage(t.id, 'live')}>
          Reopen match day
        </Button>
      ),
    };

  const looking = view !== current;

  return (
    <section className="panel overflow-hidden" aria-label="Tournament stage">
      <ol className="grid grid-cols-4 gap-1 p-2 sm:gap-2 sm:p-3">
        {STAGES.map((s, i) => {
          const done = i < current;
          const on = i === view;
          const reachable = i <= current;
          return (
            <li key={s.key} className="min-w-0">
              <button
                type="button"
                disabled={!reachable}
                aria-current={i === current ? 'step' : undefined}
                aria-pressed={on}
                onClick={() => onView(i as StageIndex)}
                className={cn(
                  'flex h-full w-full min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-center transition-colors sm:flex-row sm:items-center sm:gap-3 sm:px-3 sm:text-left',
                  on ? 'bg-sunken' : reachable ? 'hover:bg-sunken/60' : 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                    i === current ? 'bg-primary text-primary-fg' : done ? 'bg-fg text-bg' : 'border border-line-strong text-faint',
                  )}
                  aria-hidden
                >
                  {done ? <Icon name="check" size={16} strokeWidth={2.6} /> : <Icon name={s.icon} size={17} />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={cn('truncate text-[12px] font-semibold sm:text-[14px]', reachable ? 'text-fg' : 'text-muted')}>
                    {s.label}
                  </span>
                  <span className="num hidden truncate text-[12.5px] text-muted sm:block">{summary[i]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div
        className={cn(
          'flex flex-col gap-3 border-t border-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5',
          looking ? 'bg-info-soft' : 'bg-primary/10',
        )}
      >
        {looking ? (
          <>
            <p className="flex items-start gap-2 text-[14px] font-medium text-info">
              <Icon name="view" size={18} className="mt-0.5 shrink-0" />
              Looking back at {STAGES[view].label.toLowerCase()}. The tournament is at {STAGES[current].label.toLowerCase()}.
            </p>
            <Button variant="ink" className="shrink-0" iconRight={<Icon name="right" size={17} />} onClick={() => onView(current)}>
              Back to {STAGES[current].label.toLowerCase()}
            </Button>
          </>
        ) : (
          <>
            <p className="flex items-start gap-2 text-[14px] font-medium">
              <span className="eyebrow mt-0.5 shrink-0 text-fg">Next</span>
              <span className="text-muted">{next.text}</span>
            </p>
            {next.action && <div className="flex shrink-0 flex-wrap gap-2">{next.action}</div>}
          </>
        )}
      </div>
      {dialog}
    </section>
  );
}
