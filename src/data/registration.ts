import type { Tournament } from '@/engine/types';

import { todayISO } from '@/lib/format';

/** Players can enter: registration is open and its closing day (if set) hasn't passed. The database checks the same. */
export function registrationOpen(t: Pick<Tournament, 'status' | 'regCloses'>, today = todayISO()): boolean {
  return t.status === 'registration' && (!t.regCloses || today <= t.regCloses);
}
