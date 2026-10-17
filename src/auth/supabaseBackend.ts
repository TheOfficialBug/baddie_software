// Real accounts with Supabase Auth: email + password (with email confirmation and password
// reset) and Google OAuth. Roles come from the database (organization_members), so they are
// enforced by row level security, not by the browser.
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { type Access, type AuthBackend, AuthError, type AuthEvent, type AuthUser, passwordProblem } from '@/auth/types';

/** Friendly messages for Supabase Auth error codes. */
const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Wrong email or password.',
  email_not_confirmed: 'Confirm your email first: open the link we sent you, then sign in.',
  user_already_exists: 'An account with this email already exists. Sign in instead.',
  email_exists: 'An account with this email already exists. Sign in instead.',
  weak_password: 'Choose a stronger password: at least 8 characters, mixing letters with numbers or symbols.',
  same_password: 'Choose a password you haven’t used for this account.',
  over_email_send_rate_limit: 'Too many emails sent. Wait a minute and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  signup_disabled: 'New sign-ups are turned off. Ask the organizer for an invite.',
  provider_disabled: 'Google sign-in isn’t switched on for this site yet.',
  session_not_found: 'Your session has ended. Sign in again.',
};

export function toAuthError(e: unknown): AuthError {
  const err = e as { code?: string; message?: string; status?: number };
  const code = err?.code ?? 'unknown';
  if (MESSAGES[code]) return new AuthError(MESSAGES[code], code);
  if (err?.status === 0 || /fetch|network/i.test(err?.message ?? '')) {
    return new AuthError('Can’t reach the server. Check your connection and try again.', 'network');
  }
  return new AuthError(err?.message || 'Something went wrong. Try again.', code);
}

export function toUser(u: User): AuthUser {
  const meta = (u.user_metadata ?? {}) as Record<string, string | undefined>;
  const email = u.email ?? '';
  return {
    id: u.id,
    email,
    name: meta.full_name || meta.name || email.split('@')[0],
    provider: u.app_metadata?.provider === 'google' ? 'google' : 'email',
    avatarUrl: meta.avatar_url || meta.picture,
  };
}

const EVENT: Record<string, AuthEvent> = {
  SIGNED_IN: 'signed_in',
  INITIAL_SESSION: 'signed_in',
  TOKEN_REFRESHED: 'signed_in',
  SIGNED_OUT: 'signed_out',
  PASSWORD_RECOVERY: 'password_recovery',
  USER_UPDATED: 'user_updated',
};

/** `client` is created with flowType 'pkce' and detectSessionInUrl, so email links and Google return here signed in. */
export function createSupabaseBackend(client: SupabaseClient, googleEnabled: boolean): AuthBackend {
  const check = <T extends { error: unknown }>(r: T): T => {
    if (r.error) throw toAuthError(r.error);
    return r;
  };

  return {
    kind: 'supabase',
    googleEnabled,

    async getUser() {
      const { data } = await client.auth.getSession();
      return data.session?.user ? toUser(data.session.user) : null;
    },

    onChange(cb) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        cb(session?.user ? toUser(session.user) : null, EVENT[event] ?? 'signed_in');
      });
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password) {
      const { data } = check(await client.auth.signInWithPassword({ email: email.trim(), password }));
      if (!data.user) throw new AuthError('Sign-in didn’t complete. Try again.', 'no_user');
      return toUser(data.user);
    },

    async signUp({ name, email, password }, redirectTo) {
      const weak = passwordProblem(password);
      if (weak) throw new AuthError(weak, 'weak_password');
      const { data } = check(
        await client.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: redirectTo },
        }),
      );
      // With email confirmation on, Supabase hides whether the email is taken: an existing user comes back with no identities.
      if (data.user && data.user.identities?.length === 0) throw new AuthError(MESSAGES.user_already_exists, 'user_already_exists');
      return { user: data.session && data.user ? toUser(data.user) : null, needsConfirmation: !data.session };
    },

    async signInWithGoogle(redirectTo) {
      check(await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } }));
      return null; // the browser is on its way to Google
    },

    async signOut() {
      check(await client.auth.signOut());
    },

    async requestPasswordReset(email, redirectTo) {
      check(await client.auth.resetPasswordForEmail(email.trim(), { redirectTo }));
    },

    async updatePassword(password) {
      const weak = passwordProblem(password);
      if (weak) throw new AuthError(weak, 'weak_password');
      check(await client.auth.updateUser({ password }));
    },

    async updateName(name) {
      const clean = name.trim();
      if (clean.length < 2) throw new AuthError('Enter your name.', 'invalid_name');
      const { data } = check(await client.auth.updateUser({ data: { full_name: clean } }));
      if (!data.user) throw new AuthError('Sign in again to change your name.', 'not_signed_in');
      check(await client.from('profiles').update({ display_name: clean }).eq('id', data.user.id));
      return toUser(data.user);
    },

    async loadAccess(user): Promise<Access> {
      // Pending staff invites for this (verified) email become memberships; the player record is linked.
      await client.rpc('accept_my_invites');
      const claimed = await client.rpc('app_claim_player');
      const rows = check(await client.from('organization_members').select('organization_id, role').eq('user_id', user.id));
      return {
        memberships: ((rows.data ?? []) as { organization_id: string; role: Access['memberships'][number]['role'] }[]).map((r) => ({
          orgId: r.organization_id,
          role: r.role,
        })),
        playerId: (claimed.data as string | null) ?? null,
      };
    },
  };
}
