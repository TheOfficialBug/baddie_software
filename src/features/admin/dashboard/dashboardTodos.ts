// What needs the organizer's attention right now, most urgent first.
import { checkMatch } from '@/engine/rules';
import type { QueueItem } from '@/engine/scheduler';
import type { Match, TEvent, Tournament } from '@/engine/types';

import { minutesSince } from '@/lib/format';

import type { Lookup } from '@/data/lookup';

import type { IconName } from '@/components/ui/Icon';

export interface Todo {
  tag: string;
  tone: 'live' | 'warn' | 'info' | 'ok';
  icon: IconName;
  title: string;
  sub: string;
  cta: string;
  to?: string;
  onClick?: () => void;
}

interface TodoInput {
  lk: Lookup;
  t: Tournament;
  base: string;
  now: number;
  onCourt: Match[];
  queue: QueueItem[];
  freeCourts: number;
  pending: number;
  undrawn: TEvent[];
  openScore: (matchId: string) => void;
}

export function dashboardTodos({ lk, t, base, now, onCourt, queue, freeCourts, pending, undrawn, openScore }: TodoInput): Todo[] {
  const todos: Todo[] = [];
  for (const m of onCourt) {
    const decided = checkMatch(m.games, lk.matchRules(m)).ok;
    const mins = minutesSince(m.calledAt ?? now, now);
    if (decided || mins >= 30) {
      todos.push({
        tag: 'Score',
        tone: 'live',
        icon: 'whistle',
        title: decided ? `Confirm the result of #${m.number}` : `Score slip likely ready on ${lk.courtName(t.id, m.courtId)}`,
        sub: `${lk.entryName(m.a)} vs ${lk.entryName(m.b)} · on court ${mins} min`,
        cta: 'Enter',
        onClick: () => openScore(m.id),
      });
    }
  }
  if (freeCourts > 0 && queue.some((q) => !q.blocked)) {
    todos.push({
      tag: 'Courts',
      tone: 'info',
      icon: 'location',
      title: `${freeCourts} court${freeCourts > 1 ? 's' : ''} free, ${queue.filter((q) => !q.blocked).length} matches ready`,
      sub: 'Send the next matches to court. Players get notified.',
      cta: 'Call',
      to: `${base}/courts`,
    });
  }
  if (pending > 0)
    todos.push({
      tag: 'Entries',
      tone: 'warn',
      icon: 'users',
      title: `${pending} entr${pending > 1 ? 'ies' : 'y'} to confirm`,
      sub: 'New registrations waiting for you to accept them.',
      cta: 'Review',
      to: `${base}/entries`,
    });
  if (undrawn.length && t.status !== 'completed')
    todos.push({
      tag: 'Draws',
      tone: 'warn',
      icon: 'draws',
      title: `${undrawn.length} event${undrawn.length > 1 ? 's' : ''} without a draw`,
      sub: undrawn.map((e) => e.name).join(', '),
      cta: 'Make',
      to: `${base}/draws/${undrawn[0].id}`,
    });
  const resting = queue.filter((q) => q.resting).length;
  if (resting)
    todos.push({
      tag: 'Rest',
      tone: 'info',
      icon: 'timer',
      title: `${resting} ready match${resting > 1 ? 'es are' : ' is'} waiting on rest time`,
      sub: `Players get ${t.restMinutes} minutes between matches. They move up automatically.`,
      cta: 'View',
      to: `${base}/courts`,
    });
  return todos;
}
