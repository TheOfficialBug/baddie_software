/**
 * The page one level up: /admin/t/x/draws/ev → /admin/t/x/draws, /t/open/players/p1 → /t/open/players.
 * Segments that aren't pages on their own (/t, /m) are skipped: /admin/t/x/m/12 → /admin/t/x, /t/open → /.
 */
export function parentPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  parts.pop();
  while (parts.length && (parts.at(-1) === 't' || parts.at(-1) === 'm')) parts.pop();
  return `/${parts.join('/')}`;
}

/** Pages with nowhere to go back to: the public home and the organizer home. */
export const isHomePath = (pathname: string) => pathname === '/' || pathname.replace(/\/$/, '') === '/admin';
