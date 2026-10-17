import { useState } from 'react';

export interface PreviewBarProps {
  slug: string;
  togglePause: () => boolean;
  reset: () => void;
}

const link = 'rounded-full px-2.5 py-1 font-semibold hover:bg-white/15';

/** Floating dev bar for the player preview: jump to the pages players use, pause the simulation, start over. */
export function PreviewBar({ slug, togglePause, reset }: PreviewBarProps) {
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState(true);
  const t = `/t/${slug}`;
  if (!open)
    return (
      <button
        className="fixed bottom-24 left-3 z-[90] rounded-full bg-black/85 px-3 py-1.5 text-[12px] font-semibold text-white md:bottom-4"
        onClick={() => setOpen(true)}
      >
        Preview
      </button>
    );
  return (
    <div
      role="region"
      aria-label="Player preview (dev)"
      className="fixed bottom-24 left-3 right-3 z-[90] flex flex-wrap items-center gap-1 rounded-2xl bg-black/85 p-2 text-[12.5px] text-white shadow-lg backdrop-blur md:bottom-4 md:left-4 md:right-auto"
    >
      <span className="px-2 font-bold">Player preview · dev</span>
      <a className={link} href={`${t}/courts`}>
        Live scores
      </a>
      <a className={link} href={`${t}/draws`}>
        Draws
      </a>
      <a className={link} href={`${t}/schedule`}>
        Schedule
      </a>
      <a className={link} href="/waitlist">
        Waitlist
      </a>
      <button className={link} onClick={() => setPaused(togglePause())}>
        {paused ? 'Resume' : 'Pause'}
      </button>
      <button className={link} onClick={reset}>
        Reset
      </button>
      <button className={link} aria-label="Hide preview bar" onClick={() => setOpen(false)}>
        ✕
      </button>
    </div>
  );
}
