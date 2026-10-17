import { useLocation, useNavigate } from 'react-router';

import { IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { parentPath } from '@/components/ui/parentPath';

/**
 * ← in the top bar: always one level up (event → Draws, any tab → the tournament, tournament → home), never
 * browser history: hopping between sibling tabs then going "back" would bounce between them forever.
 */
export function BackButton({ className, tone }: { className?: string; tone?: 'hero' }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  return (
    <IconButton label="Back" tone={tone} className={className} onClick={() => nav(parentPath(pathname))}>
      <Icon name="left" size={22} />
    </IconButton>
  );
}
