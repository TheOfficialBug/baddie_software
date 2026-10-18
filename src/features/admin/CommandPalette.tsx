import { useEffect, useMemo, useRef, useState } from 'react';

import type { Match } from '@/engine/types';

import { cn } from '@/lib/cn';

import { type Lookup } from '@/data/lookup';

import { matchContext } from '@/components/match/matchInfo';
import { EventChip, StatusPill } from '@/components/tournament/Badges';
import { Icon } from '@/components/ui/Icon';

export function CommandPalette({
  lk,
  tid,
  onClose,
  onPick,
}: {
  lk: Lookup;
  tid: string;
  onClose: () => void;
  onPick: (matchId: string) => void;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const ms = lk.matchesOf(tid).filter((m) => m.number > 0 && m.status !== 'bye');
    const s = q.trim().toLowerCase().replace(/^#/, '');
    if (!s) return ms.filter((m) => m.status === 'on_court').concat(ms.filter((m) => m.status === 'ready').slice(0, 6));
    if (/^\d+$/.test(s))
      return ms
        .filter((m) => String(m.number).startsWith(s))
        .sort((a, b) => a.number - b.number)
        .slice(0, 10);
    const hit = (m: Match) => `${lk.entryName(m.a)} ${lk.entryName(m.b)}`.toLowerCase().includes(s);
    const order = { on_court: 0, ready: 1, pending: 2, finished: 3, bye: 4 };
    return ms
      .filter(hit)
      .sort((a, b) => order[a.status] - order[b.status] || a.number - b.number)
      .slice(0, 10);
  }, [lk, tid, q]);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => setSel(0), [q]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[max(12px,10vh)]">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close search"
        className="absolute inset-0 cursor-default bg-[rgb(var(--shadow)/0.5)]"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-xl animate-rise overflow-hidden rounded-2xl border border-line bg-raised shadow-pop"
        role="dialog"
        aria-modal="true"
        aria-label="Find a match"
      >
        <label className="flex items-center gap-3 border-b border-line px-5">
          <Icon name="search" size={20} className="text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((x) => Math.min(results.length - 1, x + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((x) => Math.max(0, x - 1));
              }
              if (e.key === 'Enter' && results[sel]) onPick(results[sel].id);
            }}
            placeholder="Match number or player name"
            aria-label="Match number or player name"
            className="input-big h-16 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-faint"
          />
          <button onClick={onClose} className="rounded-full px-2 py-1 text-[12px] font-semibold text-muted hover:bg-sunken">
            Esc
          </button>
        </label>
        <ul className="max-h-[60dvh] overflow-y-auto p-2" role="listbox">
          {!q && <li className="eyebrow px-3 py-2">On court and up next</li>}
          {results.map((m, i) => {
            const c = matchContext(lk, m);
            return (
              <li key={m.id} role="option" aria-selected={i === sel}>
                <button
                  onMouseEnter={() => setSel(i)}
                  onClick={() => onPick(m.id)}
                  className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left', i === sel && 'bg-sunken')}
                >
                  <span className="num w-12 shrink-0 text-[17px] font-semibold text-muted">#{m.number}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-semibold">
                      {lk.entryName(m.a)} <span className="font-normal text-muted">vs</span> {lk.entryName(m.b)}
                    </div>
                    <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
                      <EventChip kind={c.ev.kind} /> <span className="truncate">{c.label}</span>
                    </div>
                  </div>
                  <span className="hidden xs:block">
                    <StatusPill status={m.status} result={m.result} />
                  </span>
                </button>
              </li>
            );
          })}
          {results.length === 0 && <li className="px-3 py-8 text-center text-[14px] text-muted">No matches found.</li>}
        </ul>
        <div className="hidden border-t border-line px-5 py-2.5 text-[12px] text-muted sm:block">
          Enter opens the score form · ↑ ↓ to move
        </div>
      </div>
    </div>
  );
}
