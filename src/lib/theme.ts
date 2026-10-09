import { useEffect, useState, useSyncExternalStore } from 'react';

import { STORAGE_KEYS } from '@/config/app';

import { safeStorage } from '@/lib/storage';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = STORAGE_KEYS.theme;
const listeners = new Set<() => void>();

function read(): ThemePref {
  const v = safeStorage.get(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}
let current: ThemePref = typeof window === 'undefined' ? 'system' : read();

export function setTheme(pref: ThemePref) {
  current = pref;
  const root = document.documentElement;
  if (pref === 'system') {
    root.removeAttribute('data-theme');
    safeStorage.remove(KEY);
  } else {
    root.setAttribute('data-theme', pref);
    safeStorage.set(KEY, pref);
  }
  listeners.forEach((l) => l());
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

/** The theme actually on screen, resolving "system" through the OS setting. */
export function useResolvedTheme(): 'light' | 'dark' {
  const pref = useThemePref();
  const [osDark, setOsDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = () => setOsDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  if (pref !== 'system') return pref;
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return osDark ? 'dark' : 'light';
}

export function cycleTheme() {
  const order: ThemePref[] = ['system', 'light', 'dark'];
  setTheme(order[(order.indexOf(current) + 1) % order.length]);
}
