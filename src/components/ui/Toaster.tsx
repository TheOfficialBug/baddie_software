import { cn } from '@/lib/cn';

import { useToasts } from '@/data/toast';

import { Icon } from '@/components/ui/Icon';

/** Toasts: top-right on larger screens, above the bottom bar on phones. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] z-[70] flex flex-col items-center gap-2 px-3 md:inset-x-auto md:bottom-auto md:right-5 md:top-5 md:items-end"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex w-full max-w-[420px] animate-rise items-start gap-3 rounded-2xl border border-line bg-raised p-3.5 pr-2 text-[14px] text-fg shadow-pop"
        >
          <span
            className={cn(
              'grid h-8 w-8 shrink-0 place-items-center rounded-full',
              t.tone === 'error' ? 'bg-live-soft text-live' : t.tone === 'info' ? 'bg-info-soft text-info' : 'bg-primary text-primary-fg',
            )}
          >
            <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'info' ? 'info' : 'check'} size={17} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <div className="font-semibold leading-snug">{t.text}</div>
            {t.detail && <div className="mt-0.5 text-[13px] text-muted">{t.detail}</div>}
          </div>
          {t.undo && (
            <button
              className="min-h-9 shrink-0 rounded-full border border-line px-3 text-[13px] font-semibold hover:border-fg"
              onClick={() => {
                t.undo?.();
                dismiss(t.id);
              }}
            >
              Undo
            </button>
          )}
          <button
            aria-label="Dismiss"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken hover:text-fg"
            onClick={() => dismiss(t.id)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
