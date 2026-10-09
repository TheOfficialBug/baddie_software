import { useLocation, useNavigate } from 'react-router';

import { IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { parentPath } from '@/components/ui/parentPath';

/**
 * ← in the top bar: one page back within the app. When the page was opened straight from a link
 * (nothing earlier in this visit), it goes up to the parent page instead, never out of the app.
 */
export function BackButton({ className, tone }: { className?: string; tone?: 'hero' }) {
  const nav = useNavigate();
  const { key, pathname } = useLocation();
  // react-router gives the first page of a visit the key "default"
  const hasHistory = key !== 'default';
  return (
    <IconButton label="Back" tone={tone} className={className} onClick={() => (hasHistory ? nav(-1) : nav(parentPath(pathname)))}>
      <Icon name="left" size={22} />
    </IconButton>
  );
}
