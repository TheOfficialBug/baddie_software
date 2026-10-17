import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { cn } from '@/lib/cn';

import { toast } from '@/data/toast';

import { authActions } from '@/auth/authStore';
import { useAccess } from '@/auth/useAccess';

import { WaitlistButton } from '@/components/promo/WaitlistButton';
import { Avatar } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';

/** Header account control: "Sign in" when signed out, otherwise an avatar that opens the account menu. */
export function AccountMenu({ tone = 'default', className }: { tone?: 'default' | 'hero'; className?: string }) {
  const { status, user, isOrganizer } = useAccess();
  const loc = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (status === 'loading') return <span className="h-10 w-10" aria-hidden />;
  if (!user) {
    // visitors get the waitlist; organizers sign in from the homepage link or /login
    return <WaitlistButton size="sm" from="header" className={className} />;
  }

  const item = (to: string, icon: IconName, label: string) => (
    <li>
      <Link to={to} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-semibold hover:bg-sunken">
        <Icon name={icon} size={18} className="text-muted" /> {label}
      </Link>
    </li>
  );

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Account: ${user.name}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'grid h-11 w-11 place-items-center rounded-full transition-shadow hover:ring-2',
          tone === 'hero' ? 'hover:ring-hero-line/40' : 'hover:ring-line-strong',
          open && 'ring-2 ring-primary',
        )}
      >
        <Avatar name={user.name} size={34} />
      </button>
      {open && (
        <div
          id={id}
          className="absolute right-0 top-full z-50 mt-2 w-[min(290px,calc(100vw-24px))] animate-rise rounded-2xl border border-line bg-raised p-2 text-fg shadow-pop"
        >
          <div className="flex items-center gap-3 border-b border-line px-2.5 pb-3 pt-1.5">
            <Avatar name={user.name} size={40} />
            <div className="min-w-0">
              <div className="truncate font-semibold">{user.name}</div>
              <div className="truncate text-[12.5px] text-muted">{user.email}</div>
            </div>
          </div>
          <ul className="flex flex-col gap-0.5 py-2">
            {item('/me', 'calendar', 'My matches')}
            {isOrganizer && item('/admin', 'dashboard', 'Organizer desk')}
            {item('/account', 'settings', 'Account settings')}
          </ul>
          <button
            type="button"
            onClick={async () => {
              await authActions.signOut();
              toast('Signed out');
              nav('/', { replace: true });
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl border-t border-line px-3 pt-0.5 text-[14px] font-semibold text-muted hover:bg-sunken hover:text-fg"
          >
            <Icon name="logout" size={18} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
