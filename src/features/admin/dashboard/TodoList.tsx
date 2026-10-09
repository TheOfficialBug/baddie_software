import { cn } from '@/lib/cn';

import { Pill } from '@/components/tournament/Badges';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

import type { Todo } from '@/features/admin/dashboard/dashboardTodos';

/** "Needs your attention" panel listing the organizer's open to-dos. */
export function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <section className="panel min-w-0 py-2" aria-label="Needs your attention">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <h2 className="font-display text-[20px] font-bold">Needs your attention</h2>
        <Pill tone={todos.length ? 'warn' : 'ok'}>{todos.length ? `${todos.length} open` : 'All clear'}</Pill>
      </div>
      {todos.length === 0 && (
        <p className="flex items-center gap-2.5 border-t border-line px-5 py-5 text-[14px] text-muted">
          <Icon name="success" size={20} className="text-ok" /> Nothing needs you right now. New score slips and entries show up here.
        </p>
      )}
      <ul>
        {todos.map((td, i) => (
          <li key={i} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3.5 sm:flex-nowrap sm:gap-4">
            <Pill tone={td.tone} className="hidden min-w-[78px] justify-center sm:inline-flex">
              {td.tag}
            </Pill>
            <span
              className={cn(
                'grid h-10 w-10 shrink-0 place-items-center rounded-full sm:hidden',
                td.tone === 'live' ? 'bg-live-soft text-live' : td.tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-info-soft text-info',
              )}
            >
              <Icon name={td.icon} size={19} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <strong className="text-[14.5px]">{td.title}</strong>
              <span className="truncate text-[13px] text-muted">{td.sub}</span>
            </span>
            {td.to ? (
              <ButtonLink to={td.to} size="sm">
                {td.cta}
              </ButtonLink>
            ) : (
              <Button size="sm" variant={td.tone === 'live' ? 'primary' : 'secondary'} onClick={td.onClick}>
                {td.cta}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
