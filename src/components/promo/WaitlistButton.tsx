import { Link } from 'react-router';

import { cn } from '@/lib/cn';

import { Icon } from '@/components/ui/Icon';

/** The eye-catching "Join the waitlist" call to action: shimmering gradient, soft pulse. Used instead of Sign in. */
export function WaitlistButton({
  size = 'md',
  label,
  from,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  /** Where the visitor came from (stored with the sign-up). */
  from?: string;
  className?: string;
}) {
  const text = label ?? (size === 'sm' ? 'Join waitlist' : 'Join the waitlist');
  return (
    <Link
      to={from ? `/waitlist?from=${encodeURIComponent(from)}` : '/waitlist'}
      className={cn(
        'btn-waitlist inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold transition-transform',
        size === 'sm' && 'min-h-10 px-3.5 text-[13.5px] touch:min-h-11',
        size === 'md' && 'min-h-12 px-5 text-[15px]',
        size === 'lg' && 'min-h-14 px-7 text-[17px]',
        className,
      )}
    >
      <Icon name="sparkles" size={size === 'lg' ? 20 : 17} />
      {text}
    </Link>
  );
}
