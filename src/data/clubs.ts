// Clubs for keeping clubmates apart in draws. "No club" (or a blank club) is not a club:
// two unattached players are never "from the same club".
import type { Player } from '@/engine/types';

/** The club name, or undefined when the player has none. */
export function realClub(club?: string | null): string | undefined {
  const c = club?.trim();
  return c && c.toLowerCase() !== 'no club' ? c : undefined;
}

/**
 * The club an entry represents for separation: the shared club of its players, ignoring partners
 * without one. A doubles pair from two different clubs represents neither.
 */
export function entryClub(players: Pick<Player, 'club'>[]): string | undefined {
  const clubs = new Set(players.map((p) => realClub(p.club)).filter(Boolean));
  return clubs.size === 1 ? [...clubs][0] : undefined;
}
