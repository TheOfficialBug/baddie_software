// The signed-in account. Screens read `useAuth` / `useAccess` and call these actions;
// the backend (demo or Supabase) is chosen once at start-up from configuration.
import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config/app';
import { env } from '@/config/env';
import type { ID } from '@/engine/types';

import { reportError } from '@/lib/monitoring';
import { safeSessionStorage, safeStorage } from '@/lib/storage';
import { getSupabase } from '@/lib/supabase';
import { appUrl } from '@/lib/url';

import { useStore } from '@/data/store';

import { createDemoBackend } from '@/auth/demoBackend';
import { createSupabaseBackend } from '@/auth/supabaseBackend';
import { type Access, type AuthBackend, AuthError, type AuthUser, NO_ACCESS, type SignUpInput } from '@/auth/types';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Roles and player record (Supabase: loaded from the database; demo: see useAccess). */
  access: Access;
  backend: AuthBackend | null;
  /** The user arrived through a password-reset link and should choose a new password. */
  recovering: boolean;
}

export const useAuth = create<AuthState>()(() => ({
  status: 'loading',
  user: null,
  access: NO_ACCESS,
  backend: null,
  recovering: false,
}));

const RESET_KEY = 'smashboard.demo.reset';

/** Demo accounts read and update the local data store. */
export function createLocalBackend(): AuthBackend {
  return createDemoBackend({
    storage: safeStorage,
    session: safeSessionStorage,
    keys: { accounts: STORAGE_KEYS.demoAccounts, session: STORAGE_KEYS.demoSession, reset: RESET_KEY },
    syncAccount: (p) => useStore.getState().syncAccount(p),
    accessOf: (userId: ID) => {
      const s = useStore.getState();
      return {
        memberships: s.members.filter((m) => m.userId === userId).map((m) => ({ orgId: m.orgId, role: m.role })),
        playerId: s.players.find((p) => p.userId === userId)?.id ?? null,
      };
    },
    nameOf: (userId) => useStore.getState().profiles.find((p) => p.id === userId)?.name,
  });
}

async function createBackend(): Promise<AuthBackend> {
  if (!env.supabase) return createLocalBackend();
  return createSupabaseBackend(await getSupabase(), env.authGoogle);
}

async function applyUser(user: AuthUser | null) {
  const { backend } = useAuth.getState();
  if (!user || !backend) {
    useAuth.setState({ status: 'signedOut', user: null, access: NO_ACCESS });
    return;
  }
  let access = NO_ACCESS;
  try {
    access = await backend.loadAccess(user);
  } catch (e) {
    reportError(e, { source: 'auth.loadAccess' });
  }
  useAuth.setState({ status: 'signedIn', user, access });
}

let started: Promise<void> | null = null;

/** Start auth once: pick the backend, restore the session and follow changes. Pass a backend in tests. */
export function initAuth(backend?: AuthBackend): Promise<void> {
  if (backend) started = null;
  started ??= (async () => {
    try {
      const b = backend ?? (await createBackend());
      useAuth.setState({ backend: b });
      b.onChange((user, event) => {
        if (event === 'password_recovery') useAuth.setState({ recovering: true });
        void applyUser(user);
      });
      await applyUser(await b.getUser());
    } catch (e) {
      reportError(e, { source: 'auth.init' });
      useAuth.setState({ status: 'signedOut' });
    }
  })();
  return started;
}

const need = (): AuthBackend => {
  const b = useAuth.getState().backend;
  if (!b) throw new AuthError('Sign-in is still starting. Try again in a moment.', 'not_ready');
  return b;
};

/** Where email links (confirmation, password reset) and Google send people back to. */
export const callbackUrl = (next = '/') => appUrl(`/auth/callback?next=${encodeURIComponent(next)}`);

export const authActions = {
  async signIn(email: string, password: string) {
    const user = await need().signIn(email, password);
    await applyUser(user);
  },
  async signUp(input: SignUpInput, next = '/') {
    const r = await need().signUp(input, callbackUrl(next));
    if (r.user) await applyUser(r.user);
    return r;
  },
  async signInWithGoogle(next = '/') {
    const user = await need().signInWithGoogle(callbackUrl(next));
    if (user) await applyUser(user);
  },
  async signOut() {
    await need().signOut();
    useAuth.setState({ recovering: false });
    await applyUser(null);
  },
  requestPasswordReset(email: string) {
    return need().requestPasswordReset(email, appUrl('/reset-password'));
  },
  async updatePassword(password: string) {
    await need().updatePassword(password);
    useAuth.setState({ recovering: false });
    const user = await need().getUser();
    await applyUser(user);
  },
  async updateName(name: string) {
    const user = await need().updateName(name);
    useAuth.setState({ user });
  },
  /** Re-read roles and the player link (after registering, or after an invite was accepted). */
  async refreshAccess() {
    await applyUser(useAuth.getState().user);
  },
};

/** Demo only: a reset was requested in this tab (the reset page then works without an emailed link). */
export const demoResetPending = () => !!safeSessionStorage.get(RESET_KEY);
