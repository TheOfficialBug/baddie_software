import type { TEvent, Tournament } from '@/engine/types';

import { ButtonLink } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { type Step, StepList } from '@/components/ui/StepList';

interface ChecklistProps {
  t: Tournament;
  base: string;
  events: TEvent[];
  rulesLabel: string;
  pending: number;
  accepted: number;
  undrawn: TEvent[];
  done: number;
  matchCount: number;
}

/** Setup-to-match-day checklist with the next action for each step. */
export function TournamentChecklist({ t, base, events, rulesLabel, pending, accepted, undrawn, done, matchCount }: ChecklistProps) {
  const steps: Step[] = [
    {
      title: 'Set up the tournament',
      body: `${events.length} events, ${t.courts.length} courts, ${rulesLabel} scoring`,
      done: events.length > 0,
      action: events.length ? undefined : (
        <ButtonLink to={`${base}/entries`} size="sm" variant="primary">
          Add events
        </ButtonLink>
      ),
    },
    {
      title: 'Confirm registrations',
      body: pending ? `${pending} waiting for you` : `${accepted} entries confirmed`,
      done: accepted > 0 && pending === 0,
      current: pending > 0,
      action: pending ? (
        <ButtonLink to={`${base}/entries`} size="sm" variant="primary">
          Review entries
        </ButtonLink>
      ) : undefined,
    },
    {
      title: 'Publish the draws',
      body: undrawn.length ? `${events.length - undrawn.length} of ${events.length} published` : 'All draws are published',
      done: events.length > 0 && undrawn.length === 0,
      current: pending === 0 && undrawn.length > 0,
      action: undrawn.length ? (
        <ButtonLink to={`${base}/draws/${undrawn[0].id}`} size="sm" variant="primary">
          Make the next draw
        </ButtonLink>
      ) : undefined,
    },
    {
      title: 'Run match day',
      body: t.status === 'completed' ? 'Tournament finished' : `${done} of ${matchCount} matches played`,
      done: t.status === 'completed',
      current: undrawn.length === 0 && t.status !== 'completed',
      action:
        undrawn.length === 0 && t.status !== 'completed' ? (
          <ButtonLink to={`${base}/courts`} size="sm" variant="primary">
            Open courts
          </ButtonLink>
        ) : undefined,
    },
  ];

  return (
    <section className="panel p-5 sm:p-6" aria-label="Setup checklist">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-display text-[20px] font-bold">Tournament checklist</h2>
        <span className="num text-[13px] text-muted">
          {steps.filter((s) => s.done).length}/{steps.length}
        </span>
      </div>
      <ProgressBar value={steps.filter((s) => s.done).length} max={steps.length} tone="ink" className="mb-5" />
      <StepList steps={steps} />
    </section>
  );
}
