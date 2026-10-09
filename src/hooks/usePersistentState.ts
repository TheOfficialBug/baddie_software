import { type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';

import { safeStorage } from '@/lib/storage';

const PREFIX = 'smashboard.ui.';
/** Drafts older than this are dropped. */
const MAX_AGE_MS = 7 * 24 * 3600_000;

interface Stored<T> {
  at: number;
  value: T;
}

function read<T>(key: string): T | undefined {
  const raw = safeStorage.get(PREFIX + key);
  if (!raw) return undefined;
  try {
    const s = JSON.parse(raw) as Stored<T>;
    if (Date.now() - s.at > MAX_AGE_MS) {
      safeStorage.remove(PREFIX + key);
      return undefined;
    }
    return s.value;
  } catch {
    return undefined;
  }
}

/** Remove a saved value (e.g. a draft after it was published) from outside the component that owns it. */
export function clearPersisted(key: string) {
  safeStorage.remove(PREFIX + key);
}

/**
 * useState that is saved on this device under `key`, so the value survives switching events,
 * pages, browser tabs and reloads. Use it for unsaved work (drafts) and for screen choices
 * (selected tab or event filter).
 *
 * - `key` should include what the value belongs to, e.g. `draw:${eventId}` or `score:${matchId}`;
 *   when the key changes the hook switches to that key's saved value.
 * - Pass `null` as the key to keep the state in memory only.
 * - `clear()` forgets the saved value and goes back to `initial` (call it after saving for real).
 * - `restored` is true when the current value came from storage (show "Draft restored").
 */
export function usePersistentState<T>(key: string | null, initial: T | (() => T)) {
  const init = useRef(initial);
  init.current = initial;
  const fresh = () => (typeof init.current === 'function' ? (init.current as () => T)() : init.current);
  const load = (k: string | null): { value: T; restored: boolean } => {
    const saved = k ? read<T>(k) : undefined;
    return saved === undefined ? { value: fresh(), restored: false } : { value: saved, restored: true };
  };

  const [state, setState] = useState(() => ({ key, ...load(key) }));
  // The key changed (another event or match): switch to that key's value right away
  // (React's "adjust state while rendering" pattern).
  let current = state;
  if (state.key !== key) {
    current = { key, ...load(key) };
    setState(current);
  }

  const set = useCallback(
    (v: SetStateAction<T>) =>
      setState((s) => {
        const value = typeof v === 'function' ? (v as (p: T) => T)(s.value) : v;
        if (s.key) safeStorage.set(PREFIX + s.key, JSON.stringify({ at: Date.now(), value } satisfies Stored<T>));
        return { ...s, value, restored: s.restored };
      }),
    [],
  );

  const clear = useCallback(() => {
    setState((s) => {
      if (s.key) safeStorage.remove(PREFIX + s.key);
      return { ...s, value: fresh(), restored: false };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the stored value's age fresh while it's in use
  useEffect(() => {
    if (key && current.restored) safeStorage.set(PREFIX + key, JSON.stringify({ at: Date.now(), value: current.value }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [current.value, set, clear, current.restored] as const;
}
