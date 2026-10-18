import { NavLink } from 'react-router';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from '@/components/ui/Icon';

export type BottomBarItem = { to: string; label: string; icon: IconName; end?: boolean; badge?: boolean };

const HIDE_FROM = { md: 'md:hidden', lg: 'lg:hidden' } as const;

const tab = (active: boolean) =>
  cn(
    'relative flex min-h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-semibold leading-tight',
    active ? 'text-fg' : 'text-muted',
  );

function TabFace({ icon, label, active, badge }: { icon: IconName; label: string; active: boolean; badge?: boolean }) {
  return (
    <>
      <span className={cn('absolute top-0 h-1 w-7 rounded-b-full', active ? 'bg-primary' : 'bg-transparent')} aria-hidden />
      <span className="relative">
        <Icon name={icon} size={22} strokeWidth={active ? 2 : 1.7} />
        {badge && <span className="absolute -right-1 -top-0.5 h-2 w-2 animate-pulse-dot rounded-full bg-live" aria-hidden />}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </>
  );
}

/**
 * Phone bottom navigation (design: PublicMobile): the top destinations within thumb reach, the lime bar
 * marking the current one (NavLink sets aria-current="page"). `more` adds a last tab that opens a sheet
 * with everything else; it is marked current when the page shown is one of those.
 */
export function BottomBar({
  items,
  label = 'Sections',
  hideFrom = 'md',
  more,
}: {
  items: BottomBarItem[];
  label?: string;
  hideFrom?: keyof typeof HIDE_FROM;
  more?: { open: boolean; active: boolean; onOpen: () => void };
}) {
  return (
    <nav
      aria-label={label}
      className={cn('no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 backdrop-blur-md', HIDE_FROM[hideFrom])}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => tab(isActive)}>
          {({ isActive }) => <TabFace icon={it.icon} label={it.label} active={isActive} badge={it.badge} />}
        </NavLink>
      ))}
      {more && (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={more.open}
          onClick={more.onOpen}
          className={tab(more.active || more.open)}
        >
          <TabFace icon="more" label="More" active={more.active || more.open} />
          {more.active && <span className="sr-only">(current page is in here)</span>}
        </button>
      )}
    </nav>
  );
}
