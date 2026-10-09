import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'ink' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'onHero';
type Size = 'sm' | 'md' | 'lg';

// Pill buttons with 44px default height (touch-friendly), per the Smashboard design.
const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none transition-[background-color,color,border-color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-45 disabled:active:scale-100';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
  ink: 'bg-fg text-bg hover:bg-fg/85',
  secondary: 'border border-line bg-surface text-fg hover:border-fg/60',
  ghost: 'text-muted hover:bg-sunken hover:text-fg',
  danger: 'bg-live text-white hover:brightness-110',
  soft: 'bg-sunken text-fg hover:bg-line',
  onHero: 'border border-hero-line/25 text-hero-fg hover:bg-hero-line/10',
};
const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3.5 text-[13px]',
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
        'relative inline-flex shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info disabled:opacity-40',
        tone === 'hero' ? 'border border-hero-line/25 text-hero-fg hover:bg-hero-line/10' : 'text-muted hover:bg-sunken hover:text-fg',
        size === 'sm' ? 'h-9 w-9' : 'h-11 w-11',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
