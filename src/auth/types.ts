import type { ID } from '@/engine/types';

import type { Role } from '@/data/types';

export interface AuthUser {
  id: ID;
  email: string;
  name: string;
  provider: 'email' | 'google';
  avatarUrl?: string;
}

/** What the signed-in account may do: staff roles per organization, and its player record. */
export interface Access {
  memberships: { orgId: ID; role: Role }[];
  playerId: ID | null;
}

export const NO_ACCESS: Access = { memberships: [], playerId: null };

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

/** Events a backend reports besides plain sign-in/out. */
export type AuthEvent = 'signed_in' | 'signed_out' | 'password_recovery' | 'user_updated';

/**
 * Where accounts live. `demo` keeps accounts in this browser (previews without a backend);
 * `supabase` uses Supabase Auth. Screens only talk to the auth store, never to a backend directly.
 */
export interface AuthBackend {
  kind: 'demo' | 'supabase';
  /** Whether "Continue with Google" is available. */
  googleEnabled: boolean;
  /** Current user from a stored session, if any. */
  getUser(): Promise<AuthUser | null>;
  /** Subscribe to sign-in/out from other tabs, redirects and token refresh. Returns an unsubscribe function. */
  onChange(cb: (user: AuthUser | null, event: AuthEvent) => void): () => void;
  signIn(email: string, password: string): Promise<AuthUser>;
  /** `needsConfirmation`: the account exists but the email must be confirmed before signing in. */
  signUp(input: SignUpInput, redirectTo: string): Promise<{ user: AuthUser | null; needsConfirmation: boolean }>;
  /** Leaves the page (redirect to Google) except in demo mode. */
  signInWithGoogle(redirectTo: string): Promise<AuthUser | null>;
  signOut(): Promise<void>;
  /** Sends a reset link that opens `redirectTo` signed in for a password change. */
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  /** Change the display name (account and public profile). */
  updateName(name: string): Promise<AuthUser>;
  /** Roles and player link for the signed-in user (also accepts pending staff invites). */
  loadAccess(user: AuthUser): Promise<Access>;
}

/** An error whose message is safe and helpful to show to the person signing in. */
export class AuthError extends Error {
  override name = 'AuthError';
  constructor(
    message: string,
    readonly code: string = 'unknown',
  ) {
    super(message);
  }
}

export const MIN_PASSWORD = 8;

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (!/[A-Za-z]/.test(pw) || !/[0-9\W_]/.test(pw)) return 'Mix letters with numbers or symbols.';
  return null;
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
