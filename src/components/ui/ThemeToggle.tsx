import { cn } from '@/lib/cn';
import { setTheme, type ThemePref, useResolvedTheme, useThemePref } from '@/lib/theme';

import { IconButton } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';

const OPTIONS: { value: ThemePref; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'Auto', icon: 'system' },
];

/** Light / Dark / Auto (follows the device). */
export function ThemeToggle({ labels = false, className }: { labels?: boolean; className?: string }) {
  const pref = useThemePref();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn('inline-flex items-center gap-1 rounded-full bg-sunken p-1', className)}>
      {OPTIONS.map(({ value, label, icon }) => {
        const on = pref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            title={`${label} theme`}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors touch:min-h-11',
              on ? 'bg-surface text-fg shadow-lift' : 'text-muted hover:text-fg',
              labels && 'min-w-0 flex-1 px-2',
            )}
          >
            <Icon name={icon} size={16} />
            <span className={labels ? '' : 'sr-only'}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One-tap light/dark switch for compact headers. */
export function ThemeSwitchButton({ tone = 'default' }: { tone?: 'default' | 'hero' }) {
  const resolved = useResolvedTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  return (
    <IconButton label={`Switch to ${next} theme`} tone={tone} onClick={() => setTheme(next)}>
      <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={19} />
    </IconButton>
  );
}
