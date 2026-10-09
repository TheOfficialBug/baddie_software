// Web Storage can be missing or throw (private windows, blocked site data, embedded previews).
// These wrappers never throw: reads return null and writes are skipped when storage is unavailable.

interface SafeStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

function wrap(pick: () => Storage): SafeStorage {
  return {
    get(key) {
      try {
        return pick().getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        pick().setItem(key, value);
      } catch {
        /* storage full or unavailable */
      }
    },
    remove(key) {
      try {
        pick().removeItem(key);
      } catch {
        /* storage unavailable */
      }
    },
  };
}

/** Survives reloads and browser restarts. */
export const safeStorage = wrap(() => window.localStorage);
/** Cleared when the tab closes. */
export const safeSessionStorage = wrap(() => window.sessionStorage);
