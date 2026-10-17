import { useEffect, useMemo, useRef, useState } from 'react';

import type { EventConfig, ID, SkillLevel } from '@/engine/types';

import { usePersistentState } from '@/hooks/usePersistentState';
import { cn } from '@/lib/cn';
import { fmtAgo } from '@/lib/format';

import type { Lookup } from '@/data/lookup';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { levelLabel, SKILL_LEVELS } from '@/components/tournament/skillLevels';
import { Button, IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';

import { restoreLevels, type Snapshot, takeSnapshot } from '@/features/admin/draws/seedingSnapshot';
import { parseSeedingText, seedingText } from '@/features/admin/draws/seedingText';

/** A saved version of the seeding order (kept in this browser, per event). */
interface SeedingDraft extends Snapshot {
  id: string;
  name: string;
  at: number;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older browsers / no permission: a hidden textarea and the copy command
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/**
 * The seeding order (drag or arrows); the top `seeds` rows are seeded. Shown in a side panel.
 * Undo / redo step through every change made here (order and levels); Reset goes back to the
 * automatic order (seeds, then strongest level first) and can itself be undone.
 * Copy / Paste move the list (rank, name, level) to and from a spreadsheet or message; drafts keep
 * named versions in this browser.
 */
export function SeedingList({
  lk,
  eventId,
  order,
  onOrderChange,
  defaultOrder,
  seeds,
  pairing,
  placement,
  levelOf,
}: {
  lk: Lookup;
  /** Drafts are kept per event. */
  eventId: ID;
  order: ID[];
  onOrderChange: (order: ID[]) => void;
  /** The automatic order that Reset goes back to. */
  defaultOrder: () => ID[];
  seeds: number;
  pairing: EventConfig['pairing'];
  /** Drop flight by results: round 1 is this list split in two. */
  placement?: boolean;
  levelOf: (id: ID) => number;
}) {
  const setEntryLevel = useStore((s) => s.setEntryLevel);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [panel, setPanel] = useState<'paste' | 'drafts' | null>(null);
  const [pasted, setPasted] = useState('');
  const [draftName, setDraftName] = useState('');
  const [drafts, setDrafts] = usePersistentState<SeedingDraft[]>(`seeding.drafts:${eventId}`, []);
  const pastePlan = useMemo(() => (pasted.trim() ? parseSeedingText(pasted, lk, order) : null), [pasted, lk, order]);

  const snapshot = () => takeSnapshot(lk, order);
  /** Record the current state before a change, so it can be undone. */
  const remember = () => {
    setPast((p) => [...p, snapshot()]);
    setFuture([]);
  };
  const restore = (s: Snapshot) => {
    onOrderChange(s.order);
    restoreLevels(lk, s, setEntryLevel);
  };
  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setFuture((f) => [snapshot(), ...f]);
    setPast((p) => p.slice(0, -1));
    restore(prev);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setPast((p) => [...p, snapshot()]);
    setFuture((f) => f.slice(1));
    restore(next);
  };
  /** Apply a whole new state (paste, draft) as one undoable step. */
  const apply = (next: Snapshot) => {
    remember();
    restore(next);
  };
  const changeOrder = (next: ID[]) => {
    if (next.join() === order.join()) return;
    remember();
    onOrderChange(next);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = order.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    changeOrder(next);
  };

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, while the panel is open (not while typing)
  const keys = useRef({ undo, redo });
  keys.current = { undo, redo };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) keys.current.undo();
      else if ((k === 'z' && e.shiftKey) || k === 'y') keys.current.redo();
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section aria-label="Seeding order" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-[13px] text-muted">
          Drag a row or use the arrows.{' '}
          {placement && (pairing ?? 'balanced') !== 'random' ? (
            <>
              Round 1 follows this list, A/B entries first: any byes go to the top of it, then each C/D entry plays an A/B entry
              {pairing === 'classic' ? ' (best v worst)' : ' (first of each half together)'}.
            </>
          ) : (
            <>
              The top <span className="num font-semibold text-fg">{seeds}</span> are seeded;{' '}
              {(pairing ?? 'balanced') === 'random' ? 'everyone else is drawn at random.' : 'everyone else is ranked by skill level.'}
            </>
          )}
        </p>
        <Button
          size="sm"
          className="shrink-0"
          icon={<Icon name="sparkles" size={16} />}
          onClick={() => changeOrder(order.slice().sort((x, y) => levelOf(y) - levelOf(x)))}
        >
          Sort by level
        </Button>
      </div>
      <div className="flex items-center gap-1.5" role="toolbar" aria-label="Seeding history">
        <Button size="sm" variant="soft" icon={<Icon name="undo" size={16} />} disabled={!past.length} onClick={undo} title="Undo (Ctrl+Z)">
          Undo
        </Button>
        <Button
          size="sm"
          variant="soft"
          icon={<Icon name="redo" size={16} />}
          disabled={!future.length}
          onClick={redo}
          title="Redo (Ctrl+Shift+Z)"
        >
          Redo
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          icon={<Icon name="refresh" size={16} />}
          disabled={defaultOrder().join() === order.join()}
          onClick={() => {
            changeOrder(defaultOrder());
            toast('Seeding order reset', { detail: 'Back to the automatic order. Undo brings your changes back.' });
          }}
        >
          Reset order
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Copy, paste and drafts">
        <Button
          size="sm"
          variant="soft"
          icon={<Icon name="copy" size={16} />}
          onClick={async () => {
            const ok = await copyText(seedingText(lk, order));
            toast(ok ? `Copied ${order.length} rows` : 'Could not copy', {
              tone: ok ? 'ok' : 'error',
              detail: ok ? 'Rank, name and level, one row each. Paste into a spreadsheet, edit, and paste back here.' : undefined,
            });
          }}
        >
          Copy list
        </Button>
        <Button
          size="sm"
          variant={panel === 'paste' ? 'ink' : 'soft'}
          icon={<Icon name="task" size={16} />}
          aria-expanded={panel === 'paste'}
          onClick={async () => {
            if (panel === 'paste') return setPanel(null);
            setPanel('paste');
            // fill in what's on the clipboard when the browser allows it; otherwise the box is typed or pasted into
            try {
              const text = await navigator.clipboard.readText();
              if (text.trim()) setPasted(text);
            } catch {
              /* no permission: paste by hand */
            }
          }}
        >
          Paste list
        </Button>
        <Button
          size="sm"
          variant={panel === 'drafts' ? 'ink' : 'soft'}
          icon={<Icon name="edit" size={16} />}
          aria-expanded={panel === 'drafts'}
          onClick={() => setPanel(panel === 'drafts' ? null : 'drafts')}
        >
          Drafts{drafts.length ? ` (${drafts.length})` : ''}
        </Button>
      </div>

      {panel === 'paste' && (
        <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
          <label htmlFor="seeding-paste" className="text-[13px] text-muted">
            One player (or pair) per row, best first. Rank and level columns are optional, e.g. <span className="num">1 · Jo Lin · A</span>.
            Copy a column of names straight from a spreadsheet.
          </label>
          <textarea
            id="seeding-paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={6}
            placeholder={'1\tAlex Kim\tA\n2\tSam Rao\tA\n…'}
            className="num w-full rounded-xl border border-line bg-surface p-2.5 text-[13px] outline-none focus:border-accent"
          />
          {pastePlan && (
            <div className="text-[13px]" aria-live="polite">
              <span className="font-semibold">
                {pastePlan.matched} of {order.length} matched
              </span>
              {Object.keys(pastePlan.levels).length > 0 && (
                <span className="text-muted"> · {Object.keys(pastePlan.levels).length} with levels</span>
              )}
              {pastePlan.missing.length > 0 && (
                <span className="text-muted"> · {pastePlan.missing.length} not in the text stay at the end</span>
              )}
              {pastePlan.unmatched.length > 0 && (
                <div className="mt-1 text-warn">
                  Not recognised: {pastePlan.unmatched.slice(0, 5).join(' · ')}
                  {pastePlan.unmatched.length > 5 ? ` and ${pastePlan.unmatched.length - 5} more` : ''}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
              Close
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!pastePlan || pastePlan.matched === 0}
              onClick={() => {
                if (!pastePlan) return;
                const now = takeSnapshot(lk, order);
                apply({ order: pastePlan.order, levels: { ...now.levels, ...pastePlan.levels } });
                toast(`Seeding order pasted: ${pastePlan.matched} of ${order.length} matched`, {
                  detail: 'Undo puts the old order back. Press Save to keep it.',
                });
                setPasted('');
                setPanel(null);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      )}

      {panel === 'drafts' && (
        <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = draftName.trim() || `Draft ${drafts.length + 1}`;
              setDrafts([{ id: `${Date.now()}`, name, at: Date.now(), ...takeSnapshot(lk, order) }, ...drafts]);
              setDraftName('');
              toast(`Saved “${name}”`, { detail: 'Drafts are kept in this browser for this event.' });
            }}
          >
            <input
              aria-label="Draft name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={`Draft ${drafts.length + 1}`}
              className="min-h-9 min-w-0 flex-1 rounded-full border border-line bg-surface px-3 text-[13px] outline-none focus:border-accent"
            />
            <Button size="sm" variant="primary" type="submit">
              Save as draft
            </Button>
          </form>
          {drafts.length === 0 ? (
            <p className="text-[13px] text-muted">No drafts yet. Save one to try another order and come back to it.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {drafts.map((d) => (
                <li key={d.id} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{d.name}</span>
                    <span className="text-[12px] text-muted">
                      {fmtAgo(d.at)} · {d.order.length} entries
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={() => {
                      // entries added or withdrawn since keep their place at the end
                      const ids = new Set(order);
                      const kept = d.order.filter((id) => ids.has(id));
                      const now = takeSnapshot(lk, order);
                      const levels = Object.fromEntries(Object.entries(d.levels).filter(([id]) => ids.has(id)));
                      apply({ order: [...kept, ...order.filter((id) => !kept.includes(id))], levels: { ...now.levels, ...levels } });
                      toast(`Loaded “${d.name}”`, { detail: 'Undo puts the old order back. Press Save to keep it.' });
                    }}
                  >
                    Load
                  </Button>
                  <IconButton label={`Delete draft ${d.name}`} size="sm" onClick={() => setDrafts(drafts.filter((x) => x.id !== d.id))}>
                    <Icon name="delete" size={16} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ol className="flex flex-col gap-1">
        {order.map((id, i) => {
          const seeded = i < seeds;
          return (
            <li
              key={id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIdx(i);
              }}
              onDragEnd={() => {
                setDragIdx(null);
                setOverIdx(null);
              }}
              onDrop={() => {
                if (dragIdx !== null) move(dragIdx, i);
                setDragIdx(null);
                setOverIdx(null);
              }}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-xl py-1 pl-1.5 pr-1',
                seeded ? 'bg-sunken' : 'bg-surface',
                dragIdx === i && 'opacity-40',
                overIdx === i && dragIdx !== null && dragIdx !== i && 'ring-2 ring-accent',
                i === seeds - 1 && i < order.length - 1 && 'mb-2',
              )}
            >
              <span className="grid h-10 w-6 shrink-0 cursor-grab place-items-center text-faint active:cursor-grabbing" aria-hidden>
                <Icon name="drag" size={18} />
              </span>
              <span
                className={cn(
                  'num grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold',
                  seeded ? 'bg-fg text-bg' : 'text-faint',
                )}
              >
                {seeded ? i + 1 : '·'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{lk.entryName(id)}</span>
              {/* each player's level in this event; changing it here changes the entry (and "Sort by level") */}
              <span className="flex shrink-0 items-center gap-0.5">
                {lk.entryLevels(id).map((level, slot) => {
                  const who = lk.playersOfEntry(id)[slot]?.name ?? lk.entry(id)?.pendingPartner?.name ?? 'Partner';
                  return (
                    <Select
                      key={slot}
                      aria-label={`Skill level for ${who}`}
                      title={`${who}: ${levelLabel(level)}`}
                      value={level}
                      onChange={(e) => {
                        const next = e.target.value as SkillLevel;
                        if (next === level) return;
                        remember();
                        setEntryLevel(id, slot, next);
                        toast(`${who} is now ${levelLabel(next)}`);
                      }}
                      renderValue={(v) => v}
                      className={cn(
                        'min-h-8 w-auto gap-0.5 rounded-full border-0 px-2 py-0 text-[12px] font-bold',
                        seeded ? 'bg-surface' : 'bg-sunken',
                      )}
                    >
                      {SKILL_LEVELS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.value} · {l.title}
                        </option>
                      ))}
                    </Select>
                  );
                })}
              </span>
              <IconButton
                label={`Move ${lk.entryName(id)} up`}
                size="sm"
                className="h-10 w-10"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                <Icon name="up" size={18} />
              </IconButton>
              <IconButton
                label={`Move ${lk.entryName(id)} down`}
                size="sm"
                className="h-10 w-10"
                disabled={i === order.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <Icon name="down" size={18} />
              </IconButton>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
