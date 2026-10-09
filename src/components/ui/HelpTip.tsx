import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

import { Icon } from '@/components/ui/Icon';

/** Small "?" button that explains a term. Click to open; Esc or click outside to close. */
export function HelpTip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <span ref={ref} className={cn('relative inline-flex align-middle', className)}>
      <button
        type="button"
        aria-label={`What does “${label}” mean?`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="tap-target grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-fg"
      >
        <Icon name="help" size={17} />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-1 w-[min(280px,80vw)] -translate-x-1/2 animate-rise rounded-2xl border border-line bg-raised p-4 text-left text-[13.5px] font-normal normal-case leading-relaxed tracking-normal text-muted shadow-pop"
        >
          <span className="mb-1 block font-semibold text-fg">{label}</span>
          {children}
        </span>
      )}
    </span>
  );
}
