import { type ReactNode, useEffect, useRef } from 'react';

import { cn } from '@/lib/cn';

import { IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

/**
 * Native <dialog> (focus trap + Esc for free).
 * Phones: a bottom sheet that slides up. Tablet and up: a centered card.
 * side="right": a full-height drawer (help, notifications).
 */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  side,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  side?: 'right';
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const drawer = side === 'right';
  return (
    // Clicking the backdrop closes; keyboard users close with Escape (onCancel).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'max-h-none max-w-none overflow-visible bg-transparent p-0 text-fg backdrop:bg-transparent',
        drawer
          ? 'fixed inset-y-0 left-auto right-0 m-0 h-dvh w-full sm:w-[420px]'
          : 'fixed inset-x-0 bottom-0 top-auto m-0 w-full sm:inset-0 sm:m-auto sm:h-fit sm:w-[calc(100%-32px)]',
        !drawer && size === 'sm' && 'sm:max-w-sm',
        !drawer && size === 'md' && 'sm:max-w-lg',
        !drawer && size === 'lg' && 'sm:max-w-2xl',
        !drawer && size === 'xl' && 'sm:max-w-4xl',
        className,
      )}
    >
      {open && (
        <div
          className={cn(
            'flex flex-col border-line bg-surface shadow-pop',
            drawer
              ? 'h-full animate-slide-in border-l'
              : 'max-h-[92dvh] animate-sheet-up rounded-t-3xl border-t sm:max-h-[calc(100dvh-48px)] sm:animate-rise sm:rounded-2xl sm:border',
          )}
          style={drawer ? { paddingTop: 'env(safe-area-inset-top, 0px)' } : undefined}
        >
          {!drawer && <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />}
          <header className="flex items-start gap-3 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-[19px] font-extrabold leading-tight">{title}</h2>
              {subtitle && <div className="mt-0.5 text-[13.5px] text-muted">{subtitle}</div>}
            </div>
            <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
              <Icon name="close" size={20} />
            </IconButton>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
          {footer && (
            <footer
              className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line px-5 py-3 sm:px-6"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
            >
              {footer}
            </footer>
          )}
          {!footer && <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />}
        </div>
      )}
    </dialog>
  );
}
