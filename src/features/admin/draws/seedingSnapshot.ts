import type { ID, SkillLevel } from '@/engine/types';

import type { Lookup } from '@/data/lookup';

/** The order and every entry's levels: one step of the panel's history, or the state to go back to on Cancel. */
export interface Snapshot {
  order: ID[];
  levels: Record<ID, SkillLevel[]>;
}

export const takeSnapshot = (lk: Lookup, order: ID[]): Snapshot => ({
  order,
  levels: Object.fromEntries(order.map((id) => [id, lk.entryLevels(id)])),
});

/** Put entry levels back as they were in a snapshot (only the ones that changed). */
export function restoreLevels(lk: Lookup, s: Snapshot, setEntryLevel: (entryId: ID, slot: number, level: SkillLevel) => void) {
  for (const [id, levels] of Object.entries(s.levels)) {
    const now = lk.entryLevels(id);
    levels.forEach((l, slot) => l !== now[slot] && setEntryLevel(id, slot, l));
  }
}
