import type { ReactNode } from 'react';

/** Numbered heading for a draw-setup step, with an optional trailing action. */
export function StepHead({ n, id, title, action }: { n: number; id: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sunken text-[13px] font-semibold">{n}</span>
      <h2 id={id} className="min-w-0 flex-1 font-display text-[19px] font-extrabold leading-tight">
        {title}
      </h2>
      {action}
    </div>
  );
}
