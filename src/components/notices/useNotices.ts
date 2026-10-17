// Which notices a viewer sees, and how each kind is shown.
import { useMemo } from 'react';

import type { ID } from '@/engine/types';

import { useStore } from '@/data/store';
import type { Notice } from '@/data/types';

import { type IconName } from '@/components/ui/Icon';

export const NOTICE_ICON: Record<Notice['kind'], IconName> = {
  call: 'whistle',
  announcement: 'megaphone',
  delay: 'clock',
  draw: 'draws',
  result: 'trophy',
};

/** Notices a given player would receive (or every public one when no player is chosen). */
export function useNoticesFor(playerId: ID | null, tournamentId?: ID) {
  const notices = useStore((s) => s.notices);
  const entries = useStore((s) => s.entries);
  const events = useStore((s) => s.events);
  const clearedAt = useStore((s) => s.noticesClearedAt ?? 0);
  return useMemo(() => {
    const myEvents = new Set(entries.filter((e) => playerId && e.playerIds.includes(playerId)).map((e) => e.eventId));
    const myTournaments = new Set(events.filter((e) => myEvents.has(e.id)).map((e) => e.tournamentId));
    return notices
      .filter((n) => n.at > clearedAt)
      .filter((n) => (tournamentId ? n.tournamentId === tournamentId : !playerId || myTournaments.has(n.tournamentId)))
      .filter((n) => {
        if (n.audience === 'all') return true;
        if (!playerId) return false;
        if (n.audience === 'event') return !!n.eventId && myEvents.has(n.eventId);
        return !!n.playerIds?.includes(playerId);
      })
      .sort((a, b) => b.at - a.at);
  }, [notices, entries, events, playerId, tournamentId, clearedAt]);
}
