import { type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from '@/components/ui/Icon';

export interface ComboOption {
  /** Text put in the field when the option is picked. */
  value: string;
  /** Second line, e.g. a club or city. */
  hint?: string;
  icon?: IconName;
  /** Extra words that should match the search (not shown). */
  keywords?: string;
}

interface Props {
  id?: string;
  value: string;
  onChange: (text: string) => void;
  /** Called when a suggestion is picked (not when free text is typed). */
  onPick?: (option: ComboOption) => void;
  options: ComboOption[];
  placeholder?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  invalid?: boolean;
  autoComplete?: string;
  /** Label of the row that keeps what was typed, e.g. (t) => `Add “${t}”`. Omit to hide the row. */
  customLabel?: (text: string) => ReactNode;
  /** How many suggestions to show at most. */
  limit?: number;
  className?: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Text field with a suggestion list: type anything, or pick a suggestion.
 * Keyboard: ↓/↑ to move, Enter to pick, Esc to close. The list matches anywhere in the text.
 */
export function Combobox({
  id,
  value,
  onChange,
  onPick,
  options,
  placeholder,
  invalid,
  autoComplete = 'off',
  customLabel,
  limit = 8,
  className,
  ...aria
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  // The list floats above everything (fixed, in the dialog's top layer when inside one), so a
  // scrolling dialog body or a card with overflow never clips it.
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const listId = useId();

  const q = norm(value);
  const hits = useMemo(() => {
    const scored = options
      .map((o) => {
        const hay = norm(`${o.value} ${o.hint ?? ''} ${o.keywords ?? ''}`);
        const name = norm(o.value);
        const score = !q ? 1 : name.startsWith(q) ? 3 : name.split(/\s+/).some((w) => w.startsWith(q)) ? 2 : hay.includes(q) ? 1 : 0;
        return { o, score };
      })
      .filter((x) => x.score > 0);
    return scored
      .sort((a, b) => b.score - a.score || a.o.value.localeCompare(b.o.value))
      .slice(0, limit)
      .map((x) => x.o);
  }, [options, q, limit]);
  const exact = options.some((o) => norm(o.value) === q);
  const showCustom = !!customLabel && !!q && !exact;
  const rows = hits.length + (showCustom ? 1 : 0);

  const showing = open && rows > 0;
  useLayoutEffect(() => {
    if (!showing) return;
    const place = () => {
      const r = input.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      // open upwards when there's little room below (e.g. a field near the bottom of a sheet)
      const up = below < 220 && above > below;
      setPos({
        left: r.left,
        width: r.width,
        ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
        maxH: Math.max(140, Math.min(288, up ? above : below)),
      });
    };
    place();
    // follow the field while the page or dialog scrolls (but not when the list itself scrolls)
    const onScroll = (e: Event) => !list.current?.contains(e.target as Node) && place();
    window.addEventListener('resize', place);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [showing]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  useEffect(() => setActive(-1), [q]);

  const pick = (o: ComboOption) => {
    onChange(o.value);
    onPick?.(o);
    setOpen(false);
  };
  const keepTyped = () => {
    onChange(value.trim());
    setOpen(false);
  };

  return (
    <div ref={wrap} className={cn('relative min-w-0', className)}>
      <input
        ref={input}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && rows > 0}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete={autoComplete}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(rows - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(-1, a - 1));
          } else if (e.key === 'Enter' && open && active >= 0) {
            e.preventDefault();
            if (active < hits.length) pick(hits[active]);
            else keepTyped();
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            setOpen(false);
          } else if (e.key === 'Tab') setOpen(false);
        }}
        className={cn('field pr-10', invalid && 'border-live focus:border-live focus:ring-live/20')}
        {...aria}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? 'Hide suggestions' : 'Show suggestions'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setOpen((o) => !o);
          input.current?.focus();
        }}
        className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-fg"
      >
        <Icon name="down" size={18} className={cn('transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {showing &&
        pos &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-label="Suggestions"
            className="scroll-thin fixed z-[80] animate-rise overflow-y-auto rounded-2xl border border-line bg-raised p-1.5 text-[15px] text-fg shadow-pop"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
          >
            {hits.map((o, i) => {
              const on = norm(o.value) === q;
              return (
                // Keyboard selection happens on the input (aria-activedescendant); options take pointer input.
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={on}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                  className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2', i === active && 'bg-sunken')}
                >
                  {o.icon && <Icon name={o.icon} size={17} className="shrink-0 text-muted" />}
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate', on && 'font-semibold')}>{o.value}</span>
                    {o.hint && <span className="block truncate text-[12.5px] text-muted">{o.hint}</span>}
                  </span>
                  {on && <Icon name="check" size={17} strokeWidth={2.2} />}
                </li>
              );
            })}
            {showCustom && (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                id={`${listId}-${hits.length}`}
                role="option"
                aria-selected={false}
                onMouseEnter={() => setActive(hits.length)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={keepTyped}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[14.5px]',
                  hits.length > 0 && 'mt-1 border-t border-line pt-2.5',
                  active === hits.length && 'bg-sunken',
                )}
              >
                <Icon name="plus" size={17} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 break-words leading-snug">{customLabel(value.trim())}</span>
              </li>
            )}
          </ul>,
          wrap.current?.closest('dialog') ?? document.body,
        )}
    </div>
  );
}
