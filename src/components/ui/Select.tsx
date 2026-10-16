import {
  type ChangeEvent,
  Children,
  isValidElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/cn';

import { Icon } from '@/components/ui/Icon';

interface SelectOption {
  value: string;
  label: ReactNode;
  text: string;
  disabled?: boolean;
}

const textOf = (n: ReactNode): string =>
  typeof n === 'string' || typeof n === 'number'
    ? String(n)
    : Array.isArray(n)
      ? n.map(textOf).join('')
      : isValidElement<{ children?: ReactNode }>(n)
        ? textOf(n.props.children)
        : '';

function optionsFrom(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  Children.toArray(children).forEach((c) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(c)) return;
    if (c.type === 'option') {
      const text = textOf(c.props.children);
      out.push({ value: String(c.props.value ?? text), label: c.props.children, text, disabled: c.props.disabled });
    } else if (c.props.children) out.push(...optionsFrom(c.props.children));
  });
  return out;
}

/**
 * Rounded dropdown that replaces the browser's native list (whose corners can't be styled).
 * Same props as <select> with <option> children, so it's a drop-in swap. Keyboard: arrows,
 * Home/End, Enter/Space, Esc and type-ahead. Opens upward when there's no room below.
 */
export function Select({
  value,
  onChange,
  children,
  id,
  disabled,
  className,
  'aria-label': ariaLabel,
  title,
  placeholder = 'Choose…',
  renderValue,
}: SelectHTMLAttributes<HTMLSelectElement> & {
  placeholder?: string;
  /** What the closed button shows for the chosen value (default: the option's label). */
  renderValue?: (value: string) => ReactNode;
}) {
  const options = optionsFrom(children);
  const current = String(value ?? '');
  const selected = options.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ s: '', t: 0 });
  const listId = useId();

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 240 && above > below;
    const width = Math.max(r.width, 180);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({
      left,
      width,
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      maxH: Math.max(160, Math.min(320, up ? above : below)),
    });
  };
  const show = () => {
    if (disabled) return;
    place();
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === current),
      ),
    );
    setOpen(true);
  };
  const choose = (o: SelectOption) => {
    if (o.disabled) return;
    setOpen(false);
    btn.current?.focus();
    if (o.value !== current)
      onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } } as unknown as ChangeEvent<HTMLSelectElement>);
  };

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const close = (e: Event) => {
      if (e.type === 'scroll' && list.current?.contains(e.target as Node)) return;
      if (e.type === 'mousedown' && (list.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [open]);

  // Keep the active option visible by scrolling the list only. (scrollIntoView can also scroll
  // the page, and a page scroll closes the list.)
  useEffect(() => {
    const ul = list.current;
    const li = ul?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    if (!open || !ul || !li) return;
    if (li.offsetTop < ul.scrollTop) ul.scrollTop = li.offsetTop - 6;
    else if (li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight)
      ul.scrollTop = li.offsetTop + li.offsetHeight - ul.clientHeight + 6;
  }, [open, active]);

  const move = (d: number) => {
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + d + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    setActive(i);
  };
  const onListKey = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (options[active]) choose(options[active]);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      setOpen(false);
      btn.current?.focus();
    } else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { s: (now - typed.current.t < 700 ? typed.current.s : '') + e.key.toLowerCase(), t: now };
      const hit = options.findIndex((o) => o.text.toLowerCase().startsWith(typed.current.s));
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
        className={cn('field flex items-center gap-2 text-left', open && 'border-info ring-[3px] ring-info/20', className)}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-faint')}>
          {selected ? (renderValue ? renderValue(selected.value) : selected.label) : placeholder}
        </span>
        <Icon name="down" size={18} className={cn('shrink-0 text-muted transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={`${listId}-${active}`}
            onKeyDown={onListKey}
            className="scroll-thin fixed z-[80] animate-rise overflow-y-auto rounded-2xl border border-line bg-raised p-1.5 text-[15px] text-fg shadow-pop outline-none"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
          >
            {options.map((o, i) => {
              const on = o.value === current;
              return (
                // Keyboard selection is handled by the listbox (onListKey); options take pointer input.
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                <li
                  key={o.value + i}
                  id={`${listId}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={on}
                  aria-disabled={o.disabled || undefined}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 py-2',
                    i === active && 'bg-sunken',
                    on && 'font-semibold',
                    o.disabled && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <span className="min-w-0 flex-1">{o.label}</span>
                  {on && <Icon name="check" size={17} strokeWidth={2.2} className="text-fg" />}
                </li>
              );
            })}
          </ul>,
          // inside a modal, render in the <dialog> (top layer) so it sits above the backdrop
          btn.current?.closest('dialog') ?? document.body,
        )}
    </>
  );
}
