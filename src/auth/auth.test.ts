import { describe, expect, it, vi } from 'vitest';

import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/config/demo';

import { createDemoBackend, DEMO_GOOGLE_ACCOUNT } from '@/auth/demoBackend';
import { can, orgsWhere, roleIn } from '@/auth/permissions';
import { homeFor, loginPath, safeNext } from '@/auth/redirects';
import { createSupabaseBackend, toAuthError } from '@/auth/supabaseBackend';
import { type Access, AuthError, passwordProblem } from '@/auth/types';

describe('permissions', () => {
  it('scorers run match day only; admins also prepare; owners also manage the team', () => {
    expect(can('scorer', 'run_match_day')).toBe(true);
    expect(can('scorer', 'manage_draws')).toBe(false);
    expect(can('admin', 'manage_draws')).toBe(true);
    expect(can('admin', 'manage_team')).toBe(false);
    expect(can('owner', 'manage_team')).toBe(true);
    expect(can(null, 'run_match_day')).toBe(false);
  });

  it('roles are per organization', () => {
    const a: Access = {
      memberships: [
        { orgId: 'o1', role: 'scorer' },
        { orgId: 'o2', role: 'admin' },
      ],
      playerId: null,
    };
    expect(roleIn(a, 'o1')).toBe('scorer');
    expect(roleIn(a, 'o3')).toBeNull();
    expect(orgsWhere(a, 'create_tournament')).toEqual(['o2']);
  });
});

describe('redirects', () => {
  it('accepts in-app paths only', () => {
    expect(safeNext('/admin/t/1')).toBe('/admin/t/1');
    expect(safeNext(encodeURIComponent('/t/x/register?a=1'))).toBe('/t/x/register?a=1');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/login', '%E0%A4%A']) {
      expect(safeNext(bad)).toBeNull();
    }
  });
  it('builds login links and picks a landing page', () => {
    expect(loginPath('/me')).toBe('/login?next=%2Fme');
    expect(loginPath('//evil')).toBe('/login');
    expect(homeFor(true)).toBe('/admin');
    expect(homeFor(false)).toBe('/me');
  });
  it('asks for a reasonable password', () => {
    expect(passwordProblem('short1')).toMatch(/at least/);
    expect(passwordProblem('longpassword')).toMatch(/numbers or symbols/);
    expect(passwordProblem('badminton26')).toBeNull();
  });
});

function memoryKV() {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
}

function demo() {
  const synced: string[] = [];
  const backend = createDemoBackend({
    storage: memoryKV(),
    session: memoryKV(),
    keys: { accounts: 'acc', session: 'sess', reset: 'reset' },
    syncAccount: (p) => (synced.push(p.email), null),
    accessOf: (id) => ({ memberships: id === 'u-alex' ? [{ orgId: 'org-demo', role: 'owner' }] : [], playerId: null }),
  });
  return { backend, synced };
}

describe('demo accounts', () => {
  it('signs in a ready-made account with the demo password and restores the session', async () => {
    const { backend, synced } = demo();
    const owner = DEMO_ACCOUNTS.find((a) => a.role === 'owner')!;
    await expect(backend.signIn(owner.email, 'nope')).rejects.toThrow(/Wrong email or password/);
    const u = await backend.signIn(owner.email, DEMO_PASSWORD);
    expect(u).toMatchObject({ id: owner.id, email: owner.email, provider: 'email' });
    expect(synced).toEqual([owner.email]);
    expect(await backend.getUser()).toMatchObject({ id: owner.id });
    expect((await backend.loadAccess(u)).memberships[0].role).toBe('owner');
    await backend.signOut();
    expect(await backend.getUser()).toBeNull();
  });

  it('creates an account with a hashed password, refuses duplicates and weak passwords', async () => {
    const { backend } = demo();
    const events = vi.fn();
    backend.onChange(events);
    await expect(backend.signUp({ name: 'Maya', email: 'maya@example.com', password: 'short' }, '/')).rejects.toBeInstanceOf(AuthError);
    const r = await backend.signUp({ name: 'Maya Chen', email: 'Maya@Example.com', password: 'shuttle2026' }, '/');
    expect(r).toMatchObject({ needsConfirmation: false, user: { email: 'maya@example.com', name: 'Maya Chen' } });
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ email: 'maya@example.com' }), 'signed_in');
    await expect(backend.signUp({ name: 'X', email: 'maya@example.com', password: 'shuttle2026' }, '/')).rejects.toThrow(/already exists/);
    await backend.signOut();
    await expect(backend.signIn('maya@example.com', 'wrong-pass1')).rejects.toThrow(/Wrong/);
    expect((await backend.signIn('maya@example.com', 'shuttle2026')).name).toBe('Maya Chen');
  });

  it('resets a forgotten password through the reset step', async () => {
    const { backend } = demo();
    await backend.requestPasswordReset('sam@smashboard.demo', '/reset-password');
    await backend.updatePassword('newpass-2026');
    expect((await backend.getUser())?.email).toBe('sam@smashboard.demo');
    await backend.signOut();
    await expect(backend.signIn('sam@smashboard.demo', DEMO_PASSWORD)).rejects.toThrow(/Wrong/);
    expect((await backend.signIn('sam@smashboard.demo', 'newpass-2026')).email).toBe('sam@smashboard.demo');
  });

  it('simulates Google sign-in, and that account cannot use a password', async () => {
    const { backend } = demo();
    const u = await backend.signInWithGoogle('/');
    expect(u).toMatchObject({ email: DEMO_GOOGLE_ACCOUNT.email, provider: 'google' });
    await backend.signOut();
    await expect(backend.signIn(DEMO_GOOGLE_ACCOUNT.email, 'whatever1')).rejects.toThrow(/Google/);
  });
});

describe('supabase accounts', () => {
  const user = { id: 'u1', email: 'jo@example.com', user_metadata: { full_name: 'Jo Park' }, app_metadata: { provider: 'google' } };
  function client(over: Record<string, unknown> = {}) {
    const auth = {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: { ...user, identities: [{}] }, session: null }, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { user } } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      ...over,
    };
    const eq = vi.fn().mockResolvedValue({ data: [{ organization_id: 'o1', role: 'admin' }], error: null });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const c = {
      auth,
      rpc: vi.fn().mockImplementation((fn: string) => Promise.resolve({ data: fn === 'app_claim_player' ? 'p1' : 1, error: null })),
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq }), update }),
    };
    return c;
  }

  it('maps users and loads roles from the database', async () => {
    const c = client();
    const b = createSupabaseBackend(c as never, true);
    const u = await b.signIn('jo@example.com', 'pw');
    expect(u).toEqual({ id: 'u1', email: 'jo@example.com', name: 'Jo Park', provider: 'google', avatarUrl: undefined });
    expect(await b.loadAccess(u)).toEqual({ memberships: [{ orgId: 'o1', role: 'admin' }], playerId: 'p1' });
    expect(c.rpc).toHaveBeenCalledWith('accept_my_invites');
  });

  it('sign-up asks for email confirmation and detects existing accounts', async () => {
    const c = client();
    const b = createSupabaseBackend(c as never, false);
    expect(await b.signUp({ name: 'Jo', email: 'jo@example.com', password: 'shuttle2026' }, 'https://x/auth/callback')).toEqual({
      user: null,
      needsConfirmation: true,
    });
    expect(c.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ emailRedirectTo: 'https://x/auth/callback' }) }),
    );
    const taken = client({
      signUp: vi.fn().mockResolvedValue({ data: { user: { ...user, identities: [] }, session: null }, error: null }),
    });
    await expect(
      createSupabaseBackend(taken as never, false).signUp({ name: 'Jo', email: 'jo@example.com', password: 'shuttle2026' }, '/'),
    ).rejects.toThrow(/already exists/);
  });

  it('turns Supabase errors into friendly messages', async () => {
    const c = client({ signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: { code: 'invalid_credentials', message: 'x' } }) });
    await expect(createSupabaseBackend(c as never, false).signIn('a@b.co', 'x')).rejects.toThrow('Wrong email or password.');
    expect(toAuthError({ code: 'email_not_confirmed' }).message).toMatch(/Confirm your email/);
    expect(toAuthError({ status: 0, message: 'Failed to fetch' }).code).toBe('network');
  });

  it('starts Google sign-in with a return address', async () => {
    const c = client();
    await createSupabaseBackend(c as never, true).signInWithGoogle('https://x/auth/callback?next=%2Fme');
    expect(c.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://x/auth/callback?next=%2Fme' },
    });
  });
});
