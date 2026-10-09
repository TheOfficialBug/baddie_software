import { Link } from 'react-router';

import { APP_NAME } from '@/config/app';

import { cn } from '@/lib/cn';

import { Icon } from '@/components/ui/Icon';

/** Lime tile with a shuttlecock. */
export function ShuttleMark({ className, size = 34 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn('inline-grid shrink-0 place-items-center rounded-[10px] bg-primary text-primary-fg', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon name="shuttle" size={Math.round(size * 0.6)} strokeWidth={2} />
    </span>
  );
}

export function Logo({ to = '/', className, tone = 'default' }: { to?: string; className?: string; tone?: 'default' | 'hero' }) {
  return (
    <Link
      to={to}
      className={cn('flex items-center gap-2.5 rounded-xl', tone === 'hero' ? 'text-hero-fg' : 'text-fg', className)}
      aria-label={`${APP_NAME} home`}
    >
      <ShuttleMark />
      <span className="hidden font-display text-[21px] font-extrabold 2xs:inline">{APP_NAME}</span>
    </Link>
  );
}
