import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'ink' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'onHero';
type Size = 'sm' | 'md' | 'lg';

// Pill buttons with 44px default height (touch-friendly), per the Smashboard design.
// Motion: 200ms ease-out color/shadow changes, a 1px lift on hover (mouse only) and a press-in on tap.
const base =
  'relative inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none';
// mouse hover lift only: on touch screens a "stuck" hover would leave the button floating
const lift = '[@media(hover:hover)]:hover:-translate-y-px';
const variants: Record<Variant, string> = {
  primary: cn(
    'bg-primary text-primary-fg shadow-[0_1px_2px_rgb(var(--shadow)/0.08),0_6px_16px_-8px_rgb(var(--primary)/0.9)] hover:bg-primary-hover hover:shadow-[0_1px_2px_rgb(var(--shadow)/0.08),0_10px_22px_-8px_rgb(var(--primary)/0.95)]',
    lift,
  ),
  ink: cn('bg-fg text-bg shadow-lift hover:bg-fg/85', lift),
  secondary: 'border border-line bg-surface text-fg shadow-card hover:border-accent/40 hover:bg-accent-soft/40',
  ghost: 'text-muted hover:bg-sunken hover:text-fg',
  danger: cn('bg-live text-white shadow-lift hover:brightness-110', lift),
  soft: 'bg-sunken text-fg hover:bg-accent-soft hover:text-accent-ink',
  onHero: 'border border-hero-line/25 text-hero-fg hover:bg-hero-line/10',
};
const sizes: Record<Size, string> = {
  // 36px to look compact, with an invisible 44px hit area on touch screens
  sm: 'min-h-9 px-3.5 text-[13px] touch:after:absolute touch:after:inset-x-0 touch:after:-inset-y-1 touch:after:content-[""]',
  md: 'min-h-11 px-[18px] text-[14px]',
  lg: 'min-h-[52px] px-6 text-[15px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </button>
  );
});

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  className,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode; iconRight?: ReactNode }) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md'; tone?: 'default' | 'hero' }
>(function IconButton({ label, className, size = 'md', tone = 'default', children, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-95 disabled:opacity-40',
        tone === 'hero' ? 'border border-hero-line/25 text-hero-fg hover:bg-hero-line/10' : 'text-muted hover:bg-sunken hover:text-fg',
        size === 'sm' ? 'tap-target h-9 w-9' : 'h-11 w-11',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
