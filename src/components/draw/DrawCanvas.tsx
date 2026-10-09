import { type ReactNode, useEffect, useRef, useState } from 'react';

import { usePersistentState } from '@/hooks/usePersistentState';
import { cn } from '@/lib/cn';

import { Icon } from '@/components/ui/Icon';

const MIN = 0.4;
const MAX = 1.6;
const clamp = (z: number) => Math.round(Math.min(MAX, Math.max(MIN, z)) * 100) / 100;

/**
 * A pannable, zoomable surface for big draws. Scrolls both ways like any page (one finger on a
 * phone), drags with the mouse, pinches or Ctrl/⌘ + wheel to zoom, and has zoom buttons and "Fit".
 * The zoom is remembered on this device. "Full screen" gives the draw the whole window (Esc leaves),
 * and an optional toolbar (e.g. the draw editor's) sits above the draw, also in full screen.
 */
export function DrawCanvas({
  children,
  label,
  className,
  toolbar,
}: {
  children: ReactNode;
  label: string;
  className?: string;
  toolbar?: ReactNode;
}) {
  const [full, setFull] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = usePersistentState<number>('draw.zoom', () =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 0.85 : 1,
  );
  // latest zoom for the native listeners below
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  /** Zoom keeping the point under (cx, cy) (relative to the scroller) where it is. */
  const zoomAt = (next: number, cx?: number, cy?: number) => {
    const el = scroller.current;
    const z = clamp(next);
    if (!el || z === zoomRef.current) return;
    const x = cx ?? el.clientWidth / 2;
    const y = cy ?? el.clientHeight / 2;
    const ratio = z / zoomRef.current;
    const left = (el.scrollLeft + x) * ratio - x;
    const top = (el.scrollTop + y) * ratio - y;
    zoomRef.current = z;
    setZoom(z);
    requestAnimationFrame(() => el.scrollTo({ left, top }));
  };

  const fit = () => {
    const el = scroller.current;
    const c = content.current;
    if (!el || !c) return;
    const natural = c.scrollWidth / zoomRef.current;
    zoomAt(Math.min(1, (el.clientWidth - 8) / natural), 0, 0);
    el.scrollTo({ left: 0, top: 0 });
  };

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // Ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrl + wheel) zooms; plain wheel scrolls
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(zoomRef.current * Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setFull(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [full]);

  // Mouse: drag to pan (a short move still counts as a click). Touch: two fingers pinch to zoom.
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const distance = () => {
    const [a, b] = [...touches.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  return (
    <div
      className={cn('panel flex flex-col overflow-hidden', full && 'fixed inset-0 z-[60] rounded-none border-0', className)}
      style={full ? { paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' } : undefined}
      role={full ? 'dialog' : undefined}
      aria-modal={full || undefined}
      aria-label={full ? label : undefined}
    >
      {toolbar && <div className="shrink-0 border-b border-line">{toolbar}</div>}
      <div className="relative min-h-0 flex-1">
        <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-full border border-line bg-surface/95 p-0.5 shadow-sm backdrop-blur">
          <button type="button" aria-label="Zoom out" onClick={() => zoomAt(zoom - 0.15)} className={zoomBtn}>
            <Icon name="minus" size={15} />
          </button>
          <button
            type="button"
            aria-label="Reset zoom to 100%"
            onClick={() => zoomAt(1)}
            className="num min-h-8 min-w-11 rounded-full px-1 text-[11.5px] font-semibold text-muted hover:text-fg touch:min-h-10"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => zoomAt(zoom + 0.15)} className={zoomBtn}>
            <Icon name="plus" size={15} />
          </button>
          <button
            type="button"
            onClick={fit}
            className="min-h-8 rounded-full px-2.5 text-[12px] font-semibold text-muted hover:bg-sunken hover:text-fg touch:min-h-10"
          >
            Fit
          </button>
          <button
            type="button"
            aria-label={full ? 'Leave full screen (Esc)' : 'Full screen'}
            title={full ? 'Leave full screen (Esc)' : 'Full screen'}
            aria-pressed={full}
            onClick={() => setFull((v) => !v)}
            className={cn(zoomBtn, full && 'bg-fg text-bg hover:bg-fg hover:text-bg')}
          >
            <Icon name={full ? 'close' : 'fullscreen'} size={15} />
          </button>
        </div>
        <div
          ref={scroller}
          role="region"
          aria-label={`${label}. Scroll or drag to move around; pinch or use the buttons to zoom.`}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the canvas scrolls with the arrow keys
          tabIndex={0}
          className={cn(
            'scroll-thin overflow-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-info lg:cursor-grab',
            // as tall as the window allows (header and bottom bar aside); the whole window in full screen
            full ? 'h-full' : 'h-[max(420px,calc(100dvh-170px))]',
          )}
          style={{ touchAction: 'pan-x pan-y' }}
          onPointerDown={(e) => {
            if (e.pointerType === 'touch') {
              touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (touches.current.size === 2) pinch.current = { dist: distance(), zoom: zoomRef.current };
              return;
            }
            // draggable things (players in the draw editor) are dragged, not the canvas
            if (e.button !== 0 || (e.target as Element).closest('[draggable="true"]')) return;
            const el = scroller.current!;
            drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
          }}
          onPointerMove={(e) => {
            if (e.pointerType === 'touch') {
              if (!touches.current.has(e.pointerId)) return;
              touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (pinch.current && touches.current.size === 2) {
                const r = scroller.current!.getBoundingClientRect();
                const [a, b] = [...touches.current.values()];
                zoomAt(pinch.current.zoom * (distance() / pinch.current.dist), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
              }
              return;
            }
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (!d.moved && Math.hypot(dx, dy) < 5) return;
            if (!d.moved) scroller.current!.setPointerCapture(e.pointerId);
            d.moved = true;
            scroller.current!.scrollTo({ left: d.left - dx, top: d.top - dy });
          }}
          onPointerUp={(e) => {
            touches.current.delete(e.pointerId);
            if (touches.current.size < 2) pinch.current = null;
            // a real drag shouldn't also open the match under the pointer
            if (drag.current?.moved) {
              const stop = (c: Event) => {
                c.stopPropagation();
                c.preventDefault();
              };
              window.addEventListener('click', stop, { capture: true, once: true });
              setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
            }
            drag.current = null;
          }}
          onPointerCancel={(e) => {
            touches.current.delete(e.pointerId);
            pinch.current = null;
            drag.current = null;
          }}
        >
          <div ref={content} className="w-max select-none p-4 pt-12" style={{ zoom }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

const zoomBtn = 'grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-sunken hover:text-fg touch:h-10 touch:w-10';
