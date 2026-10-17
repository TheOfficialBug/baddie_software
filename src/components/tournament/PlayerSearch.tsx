import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import type { Tournament } from '@/engine/types';

import { cn } from '@/lib/cn';

import type { Lookup } from '@/data/lookup';
import { tournamentPlayers } from '@/data/queries';

import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';

/** "Find a player" with a results dropdown. Works on light pages and on the ink hero band. */
export function PlayerSearch({
  lk,
  t,
  autoFocus,
  limit = 8,
  placeholder,
  className,
}: {
  lk: Lookup;
  t: Tournament;
  autoFocus?: boolean;
  limit?: number;
  placeholder?: string;
  className?: string;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const all = useMemo(() => tournamentPlayers(lk, t), [lk, t]);
  const hits = q.trim() ? all.filter((p) => `${p.name} ${p.club}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, limit) : [];
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setQ('');
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => setActive(0), [q]);
  const go = (id: string) => {
    setQ('');
    nav(`/t/${t.slug}/players/${id}`);
  };
  return (
    <div ref={ref} className={cn('relative min-w-0', className)}>
      <label className="relative flex items-center">
        <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 text-muted" />
        <span className="sr-only">Find a player</span>
        <input
          // opt-in: only used where the page exists to search (e.g. a search sheet)
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(hits.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && hits[active]) go(hits[active].id);
            else if (e.key === 'Escape') setQ('');
          }}
          placeholder={placeholder ?? 'Find a player, see their next match'}
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={listId}
          aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          className="min-h-11 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-[15px] text-fg outline-none placeholder:text-faint focus:border-accent focus:ring-[3px] focus:ring-primary/25"
        />
      </label>
      {q.trim() && (
        <div
          className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-line bg-raised text-fg shadow-pop"
          role="listbox"
          id={listId}
          aria-label="Players"
        >
          {hits.length === 0 ? (
            <p className="px-4 py-3.5 text-[14px] text-muted">Nobody called “{q}” is entered.</p>
          ) : (
            hits.map((p, i) => (
              <Link
                key={p.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                to={`/t/${t.slug}/players/${p.id}`}
                onClick={() => setQ('')}
                onMouseEnter={() => setActive(i)}
                className={cn('flex min-h-12 items-center gap-3 px-3.5 py-2', i === active && 'bg-sunken')}
              >
                <Avatar name={p.name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold">{p.name}</span>
                  <span className="block truncate text-[12.5px] text-muted">{p.club}</span>
                </span>
                <Icon name="right" size={16} className="text-muted" />
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
