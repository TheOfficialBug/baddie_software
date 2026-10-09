import { type InputHTMLAttributes, type ReactNode, useState } from 'react';

import { cn } from '@/lib/cn';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { ThemeSwitchButton } from '@/components/ui/ThemeToggle';

/** Focused page for sign-in flows: logo, one card, nothing else to get lost in. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <header className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between px-4 sm:px-6">
        <Logo />
        <ThemeSwitchButton />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-[420px]">
          <div className="mb-6 text-center">
            <h1 className="font-display text-[clamp(26px,5vw,32px)] font-extrabold leading-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
          </div>
          <div className="panel p-5 shadow-card sm:p-7">{children}</div>
          {footer && <div className="mt-5 text-center text-[14px] text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

/** Password input with a show/hide toggle. */
export function PasswordInput({ invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={shown ? 'text' : 'password'}
        aria-invalid={invalid || undefined}
        className={cn('field pr-12', props.className)}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-fg touch:h-11 touch:w-11"
      >
        <Icon name={shown ? 'hide' : 'view'} size={18} />
      </button>
    </div>
  );
}

/** Google's multicolour "G" (per Google's sign-in branding guidelines). */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function GoogleButton({ onClick, busy, label = 'Continue with Google' }: { onClick: () => void; busy?: boolean; label?: string }) {
  return (
    <Button type="button" variant="secondary" size="lg" className="w-full" onClick={onClick} disabled={busy} icon={<GoogleMark />}>
      {label}
    </Button>
  );
}

/** "or" divider between Google and the email form. */
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-[12.5px] font-semibold uppercase tracking-wider text-faint" role="separator">
      <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Error box at the top of an auth form (announced to screen readers). */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl bg-live-soft px-3.5 py-3 text-[14px] font-medium text-live">
      <Icon name="alert" size={17} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
