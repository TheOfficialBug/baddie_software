// Live updates between tabs and windows on this device: when the desk (or the simulator) saves
// a change in one tab, every other open tab reloads the data straight away — e.g. the public
// page on a hall TV next to the desk. Across devices this is Supabase Realtime's job.
import { STORAGE_KEYS } from '@/config/app';

import { useStore } from '@/data/store';

let started = false;

export function startCrossTabSync(): () => void {
  if (started || typeof window === 'undefined') return () => undefined;
  started = true;
  let pending = 0;
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEYS.db || e.newValue === null) return;
    // coalesce bursts (auto-play can save several times a second)
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => void useStore.persist.rehydrate());
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('storage', onStorage);
    started = false;
  };
}
