// Demo accounts, kept in this browser. Used when no Supabase project is configured, so every
// sign-in flow and role can be tried on a preview. NOT a security boundary: anyone with the
// device can read local storage. Real accounts use Supabase Auth (supabaseBackend.ts).
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/config/demo';
import type { ID } from '@/engine/types';

import type { Profile } from '@/data/types';

import {
  type Access,
  type AuthBackend,
  AuthError,
  type AuthEvent,
  type AuthUser,
  EMAIL_RE,
  passwordProblem,
  type SignUpInput,
} from '@/auth/types';

interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

interface StoredAccount {
  id: ID;
  email: string;
  name: string;
  provider: 'email' | 'google';
  salt?: string;
  hash?: string;
}

export interface DemoBackendOptions {
  /** Survives reloads (accounts, session). */
  storage: KV;
  /** Cleared with the tab (pending password reset). */
  session: KV;
  keys: { accounts: string; session: string; reset: string };
  /** Create/refresh the profile, accept invites, link the player. Returns the player id. */
  syncAccount: (p: Profile) => ID | null;
  /** Roles and player of an account, from the local data. */
  accessOf: (userId: ID) => Access;
  /** Display name for a ready-made account (e.g. its player's name). */
  nameOf?: (userId: ID) => string | undefined;
}

export const DEMO_GOOGLE_ACCOUNT = { email: 'jordan.park@gmail.example', name: 'Jordan Park' };

const norm = (e: string) => e.trim().toLowerCase();

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const randomId = (prefix: string) => `${prefix}-${crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 12)}`;

export function createDemoBackend(o: DemoBackendOptions): AuthBackend {
  const listeners = new Set<(u: AuthUser | null, e: AuthEvent) => void>();
  const emit = (u: AuthUser | null, e: AuthEvent) => listeners.forEach((l) => l(u, e));

  const stored = (): StoredAccount[] => {
    try {
      return JSON.parse(o.storage.get(o.keys.accounts) ?? '[]') as StoredAccount[];
    } catch {
      return [];
    }
  };
  const save = (list: StoredAccount[]) => o.storage.set(o.keys.accounts, JSON.stringify(list));
  const seed = (email: string) => DEMO_ACCOUNTS.find((a) => a.email === norm(email));
  const find = (email: string) => stored().find((a) => a.email === norm(email));
  const byId = (id: ID): StoredAccount | undefined => {
    const s = stored().find((a) => a.id === id);
    if (s) return s;
    const d = DEMO_ACCOUNTS.find((a) => a.id === id);
    return d && { id: d.id, email: d.email, name: d.name, provider: 'email' };
  };
  const toUser = (a: StoredAccount): AuthUser => ({ id: a.id, email: a.email, name: o.nameOf?.(a.id) ?? a.name, provider: a.provider });
  const startSession = (a: StoredAccount) => {
    o.storage.set(o.keys.session, a.id);
    o.syncAccount({ id: a.id, name: o.nameOf?.(a.id) ?? a.name, email: a.email });
    const u = toUser(a);
    emit(u, 'signed_in');
    return u;
  };
  const setPassword = async (a: StoredAccount, password: string) => {
    const salt = randomId('s');
    const next = { ...a, salt, hash: await sha256(`${salt}:${password}`) };
    save([...stored().filter((x) => x.id !== a.id), next]);
    return next;
  };

  return {
    kind: 'demo',
    googleEnabled: true,

    async getUser() {
      const id = o.storage.get(o.keys.session);
      const a = id ? byId(id) : undefined;
      return a ? toUser(a) : null;
    },

    onChange(cb) {
      listeners.add(cb);
      // another tab signed in or out
      const onStorage = (e: StorageEvent) => {
        if (e.key !== o.keys.session) return;
        const a = e.newValue ? byId(e.newValue) : undefined;
        cb(a ? toUser(a) : null, a ? 'signed_in' : 'signed_out');
      };
      if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(cb);
        if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      };
    },

    async signIn(email, password) {
      const own = find(email);
      if (own) {
        if (!own.hash) throw new AuthError('This account signs in with Google. Use “Continue with Google”.', 'use_google');
        if ((await sha256(`${own.salt}:${password}`)) !== own.hash) throw new AuthError('Wrong email or password.', 'invalid_credentials');
        return startSession(own);
      }
      const d = seed(email);
      if (d && password === DEMO_PASSWORD) return startSession({ id: d.id, email: d.email, name: d.name, provider: 'email' });
      throw new AuthError('Wrong email or password.', 'invalid_credentials');
    },

    async signUp({ name, email, password }: SignUpInput) {
      const e = norm(email);
      if (!EMAIL_RE.test(e)) throw new AuthError('Enter a valid email address.', 'invalid_email');
      const weak = passwordProblem(password);
      if (weak) throw new AuthError(weak, 'weak_password');
      if (find(e) || seed(e)) throw new AuthError('An account with this email already exists. Sign in instead.', 'user_already_exists');
      const a = await setPassword({ id: randomId('u'), email: e, name: name.trim() || e.split('@')[0], provider: 'email' }, password);
      return { user: startSession(a), needsConfirmation: false };
    },

    async signInWithGoogle() {
      const existing = find(DEMO_GOOGLE_ACCOUNT.email);
      const a = existing ?? {
        id: randomId('u'),
        email: DEMO_GOOGLE_ACCOUNT.email,
        name: DEMO_GOOGLE_ACCOUNT.name,
        provider: 'google' as const,
      };
      if (!existing) save([...stored(), a]);
      return startSession(a);
    },

    async signOut() {
      o.storage.remove(o.keys.session);
      emit(null, 'signed_out');
    },

    async requestPasswordReset(email) {
      if (!EMAIL_RE.test(norm(email))) throw new AuthError('Enter a valid email address.', 'invalid_email');
      // Demo: no email is sent; the reset page picks this up as if the link had been opened.
      o.session.set(o.keys.reset, norm(email));
    },

    async updatePassword(password) {
      const weak = passwordProblem(password);
      if (weak) throw new AuthError(weak, 'weak_password');
      const currentId = o.storage.get(o.keys.session);
      const pending = o.session.get(o.keys.reset);
      const account =
        (currentId && byId(currentId)) ||
        (pending && (find(pending) ?? (seed(pending) ? { ...seed(pending)!, provider: 'email' as const } : undefined)));
      if (!account) throw new AuthError('This reset link has expired. Ask for a new one.', 'reset_expired');
      const next = await setPassword({ id: account.id, email: account.email, name: account.name, provider: 'email' }, password);
      o.session.remove(o.keys.reset);
      if (!currentId) startSession(next);
      else emit(toUser(next), 'user_updated');
    },

    async updateName(name) {
      const id = o.storage.get(o.keys.session);
      const a = id ? byId(id) : undefined;
      if (!a) throw new AuthError('Sign in again to change your name.', 'not_signed_in');
      const clean = name.trim();
      if (clean.length < 2) throw new AuthError('Enter your name.', 'invalid_name');
      save([...stored().filter((x) => x.id !== a.id), { ...(stored().find((x) => x.id === a.id) ?? a), name: clean }]);
      o.syncAccount({ id: a.id, name: clean, email: a.email });
      const u = { ...toUser(a), name: clean };
      emit(u, 'user_updated');
      return u;
    },

    async loadAccess(user) {
      return o.accessOf(user.id);
    },
  };
}

/** Demo only: a password reset was requested in this tab and not used yet. */
export const hasPendingDemoReset = (session: KV, key: string) => !!session.get(key);
