import { hashString } from '@/engine/rng';

import { cn } from '@/lib/cn';

const AVATAR_TONES = [
  'bg-ms/15 text-ms',
  'bg-ws/15 text-ws',
  'bg-md/15 text-md',
  'bg-wd/15 text-wd',
  'bg-xd/15 text-xd',
  'bg-fc/15 text-fc',
  'bg-fd/15 text-fd',
  'bg-primary text-primary-fg',
];

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold',
        AVATAR_TONES[hashString(name) % AVATAR_TONES.length],
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials}
    </span>
  );
}
