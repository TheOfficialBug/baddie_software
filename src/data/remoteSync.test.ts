// @vitest-environment jsdom
// The live sync engine against an in-memory Supabase (src/test/fakeSupabase.ts): lost writes,
// races between devices, offline and reload, refused writes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as EnvMod from '@/config/env';
import type { Match } from '@/engine/types';

import type * as Remote from '@/data/remote';
import type * as Store from '@/data/store';
import type * as Toast from '@/data/toast';
import type { Role } from '@/data/types';

import type * as Auth from '@/auth/authStore';

import { FakeSupabase } from '@/test/fakeSupabase';

const h = vi.hoisted(() => ({ fake: null as unknown as FakeSupabase }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => Promise.resolve(h.fake) }));
// live mode: the store starts empty and keeps no data in the browser
vi.mock('@/config/env', async (orig) => {
  const { env } = await orig<typeof EnvMod>();
  return { env: { ...env, supabase: { url: 'https://db.example.com', anonKey: 'anon' } } };
});

const OFFLINE = { message: 'TypeError: Failed to fetch' };

const match = (id: string, extra: Partial<Match> = {}): Match =>
  ({
    id,
    eventId: 'ev1',
    stageId: 's1',
    round: 1,
    slot: 0,
    number: 1,
    a: 'e1',
    b: 'e2',
    status: 'on_court',
    games: [],
    live: [0, 0],
    ...extra,
  }) as Match;

type Mods = {
  remote: typeof Remote;
  store: typeof Store;
  auth: typeof Auth;
  toast: typeof Toast;
};

/** A fresh page load: new modules (same browser storage, same database). */
async function open(role: Role | null = 'owner', signedIn = true): Promise<Mods> {
  // the page before (if any) is gone, with its connection
  for (const c of h.fake.channels) c.removed = true;
  vi.resetModules();
  const mods: Mods = {
    remote: await import('@/data/remote'),
    store: await import('@/data/store'),
    auth: await import('@/auth/authStore'),
    toast: await import('@/data/toast'),
  };
  mods.auth.useAuth.setState({
    status: signedIn ? 'signedIn' : 'signedOut',
    user: signedIn ? { id: 'u1', email: 'desk@example.com', name: 'Desk', provider: 'email' } : null,
    access: { memberships: role ? [{ orgId: 'o1', role }] : [], playerId: null },
  });
  mods.remote.startRemoteSync();
  await vi.waitFor(() => expect(mods.remote.useRemote.getState().status).toBe('ready'));
  await vi.waitFor(() => expect(h.fake.live().length).toBe(1));
  return mods;
}

const localMatch = (m: Mods, id: string) => m.store.useStore.getState().matches.find((x) => x.id === id);
const editMatch = (m: Mods, id: string, patch: Partial<Match>) =>
  m.store.useStore.setState((s) => ({ matches: s.matches.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
const settle = () => new Promise((r) => setTimeout(r, 20));

let release: () => void = () => undefined;
const hold = () => new Promise<void>((r) => (release = r));

beforeEach(() => {
  h.fake = new FakeSupabase();
  h.fake.commit('tournaments', 't1', { id: 't1', name: 'Iowa Open' }, null);
  h.fake.commit('matches', 'm1', match('m1'), null);
  h.fake.commit('matches', 'm2', match('m2', { number: 2 }), null);
  h.fake.outbox = [];
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('live sync', () => {
  it('loads the database and writes local changes back', async () => {
    const m = await open();
    expect(localMatch(m, 'm1')?.status).toBe('on_court');
    editMatch(m, 'm1', { live: [3, 1] });
    expect(await m.remote.saved()).toBe(true);
    expect(h.fake.get('matches', 'm1')?.data.live).toEqual([3, 1]);
  });

  it('keeps unsaved scores when a phone reloads before the connection is back', async () => {
    let m = await open();
    h.fake.fail = (q) => (q.write ? OFFLINE : null);
    editMatch(m, 'm1', { live: [5, 2] });
    await settle();
    expect(m.remote.useRemote.getState().pending).toBe(1);

    // the tab reloads while still offline for writes, then the connection is back
    m = await open();
    expect(localMatch(m, 'm1')?.live).toEqual([5, 2]);
    h.fake.fail = () => null;
    expect(await m.remote.saved()).toBe(true);
    expect(h.fake.get('matches', 'm1')?.data.live).toEqual([5, 2]);
  });

  it('does not keep another account’s unsaved changes', async () => {
    let m = await open();
    h.fake.fail = (q) => (q.write ? OFFLINE : null);
    editMatch(m, 'm1', { live: [5, 2] });
    await settle();
    h.fake.fail = () => null;
    m = await open(null, false);
    expect(localMatch(m, 'm1')?.live).toEqual([0, 0]);
    expect(h.fake.get('matches', 'm1')?.data.live).toEqual([0, 0]);
  });

  it('shows a change another device saved while this device’s write was on its way', async () => {
    const m = await open();
    h.fake.holdResponse = hold();
    editMatch(m, 'm1', { live: [10, 9] });
    await vi.waitFor(() => expect(h.fake.get('matches', 'm1')?.data.live).toEqual([10, 9]));
    // the desk saves the result right after; its Realtime event arrives before our answer
    h.fake.commit(
      'matches',
      'm1',
      match('m1', {
        status: 'finished',
        games: [
          [21, 15],
          [21, 17],
        ],
        live: null,
        winner: 'a',
      }),
    );
    h.fake.deliver();
    h.fake.holdResponse = null;
    release();
    expect(await m.remote.saved()).toBe(true);
    await vi.waitFor(() => expect(localMatch(m, 'm1')?.status).toBe('finished'));
  });

  it('does not overwrite a result saved elsewhere with scores typed while offline', async () => {
    const m = await open();
    h.fake.fail = () => OFFLINE;
    editMatch(m, 'm1', { live: [4, 4] });
    await settle();
    h.fake.commit(
      'matches',
      'm1',
      match('m1', {
        status: 'finished',
        games: [
          [21, 15],
          [21, 17],
        ],
        live: null,
        winner: 'a',
      }),
    );
    h.fake.outbox = []; // this device was offline: it never got the event
    h.fake.fail = () => null;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(m.remote.useRemote.getState().pending).toBe(0));
    expect(h.fake.get('matches', 'm1')?.data.status).toBe('finished');
    await vi.waitFor(() => expect(localMatch(m, 'm1')?.status).toBe('finished'));
    expect(m.toast.useToasts.getState().toasts.some((t) => t.tone === 'error')).toBe(true);
  });

  it('still saves offline scores nobody else touched', async () => {
    const m = await open();
    h.fake.fail = () => OFFLINE;
    editMatch(m, 'm1', { live: [4, 4] });
    await settle();
    h.fake.commit('matches', 'm2', match('m2', { live: [1, 0] }));
    h.fake.outbox = [];
    h.fake.fail = () => null;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(h.fake.get('matches', 'm1')?.data.live).toEqual([4, 4]));
  });

  it('a refused record does not take the rest of the change down with it', async () => {
    h.fake.canWrite = (coll) => ['matches', 'updates', 'notices', 'checkIns'].includes(coll);
    const m = await open('scorer');
    m.store.useStore.setState((s) => ({
      matches: s.matches.map((x) => (x.id === 'm1' ? { ...x, live: [7, 7] as [number, number] } : x)),
      tournaments: s.tournaments.map((t) => ({ ...t, name: 'Renamed' })),
    }));
    await m.remote.saved();
    expect(h.fake.get('matches', 'm1')?.data.live).toEqual([7, 7]);
    expect(h.fake.get('tournaments', 't1')?.data.name).toBe('Iowa Open');
    await vi.waitFor(() => expect(m.store.useStore.getState().tournaments[0]?.name).toBe('Iowa Open'));
  });

  it('keeps receiving live changes after signing in on the same page', async () => {
    const m = await open(null, false);
    m.auth.useAuth.setState({
      status: 'signedIn',
      user: { id: 'u1', email: 'desk@example.com', name: 'Desk', provider: 'email' },
      access: { memberships: [{ orgId: 'o1', role: 'owner' }], playerId: null },
    });
    await settle();
    await vi.waitFor(() => expect(h.fake.live().length).toBe(1));
    expect(m.remote.useRemote.getState().live).toBe(true);
    h.fake.commit('matches', 'm2', match('m2', { live: [2, 0] }));
    h.fake.deliver();
    expect(localMatch(m, 'm2')?.live).toEqual([2, 0]);
  });

  it('ignores a Realtime event without its data and fetches the record instead', async () => {
    const m = await open();
    const row = h.fake.commit('matches', 'm2', match('m2', { live: [6, 3] }));
    h.fake.outbox = [];
    for (const c of h.fake.live())
      c.handler?.({ new: { coll: 'matches', id: 'm2', deleted: false, version: row.version, client_id: 'other' } });
    expect(m.store.useStore.getState().matches.every(Boolean)).toBe(true);
    await vi.waitFor(() => expect(localMatch(m, 'm2')?.live).toEqual([6, 3]));
  });

  it('does not undo its own saved change when a reload overlaps the write', async () => {
    const m = await open();
    h.fake.holdReads = hold();
    const loading = m.remote.reload(); // reads the database before the write below lands
    await settle();
    const done = release;
    editMatch(m, 'm1', { live: [8, 8] });
    await vi.waitFor(() => expect(h.fake.get('matches', 'm1')?.data.live).toEqual([8, 8]));
    await settle();
    h.fake.holdReads = null;
    done();
    await loading;
    await m.remote.saved();
    await settle();
    expect(h.fake.get('matches', 'm1')?.data.live).toEqual([8, 8]);
    expect(localMatch(m, 'm1')?.live).toEqual([8, 8]);
  });

  it('retries the first load by itself when the server was unreachable', async () => {
    h.fake.fail = () => OFFLINE;
    vi.resetModules();
    const remote = await import('@/data/remote');
    const auth = await import('@/auth/authStore');
    auth.useAuth.setState({ status: 'signedOut', user: null, access: { memberships: [], playerId: null } });
    remote.startRemoteSync();
    await vi.waitFor(() => expect(remote.useRemote.getState().status).toBe('error'));
    h.fake.fail = () => null;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(remote.useRemote.getState().status).toBe('ready'));
  });
});
