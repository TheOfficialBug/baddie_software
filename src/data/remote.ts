// Live data with Supabase. Every record of the data snapshot is a row in `app_entities`
// (see supabase/migrations/20261017120000_app_entities.sql):
//  - on start (and on sign-in/out) the snapshot is loaded from the database;
//  - changes made through the store are diffed against what the database last had and written back
//    (staff directly; players through `app_submit`, which only accepts their own registration);
//  - other devices' changes arrive through Supabase Realtime, with a catch-up query by `version`
//    when the connection drops, so phones, the hall TV and the desk stay in step.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';

import { STORAGE_KEYS } from '@/config/app';
import type { Player } from '@/engine/types';

import { reportError } from '@/lib/monitoring';
import { safeSessionStorage } from '@/lib/storage';
import { getSupabase } from '@/lib/supabase';

import { useStore } from '@/data/store';
import { toast } from '@/data/toast';
import type { DB, Membership, Organization, OrgInvite, Profile, Role } from '@/data/types';

import { useAuth } from '@/auth/authStore';

/** Collections kept in `app_entities`, with the key that identifies a record. */
export const SYNCED = {
  tournaments: (x: { id: string }) => x.id,
  players: (x: { id: string }) => x.id,
  events: (x: { id: string }) => x.id,
  entries: (x: { id: string }) => x.id,
  stages: (x: { id: string }) => x.id,
  groups: (x: { id: string }) => x.id,
  matches: (x: { id: string }) => x.id,
  registrations: (x: { id: string }) => x.id,
  notices: (x: { id: string }) => x.id,
  updates: (x: { id: string }) => x.id,
  drawDrafts: (x: { eventId: string }) => x.eventId,
  checkIns: (x: { tournamentId: string; playerId: string }) => `${x.tournamentId}:${x.playerId}`,
} as const;
export type SyncedColl = keyof typeof SYNCED;
const COLLS = Object.keys(SYNCED) as SyncedColl[];
const keyOf = (coll: SyncedColl, rec: unknown) => (SYNCED[coll] as (x: unknown) => string)(rec);

export interface Row {
  coll: SyncedColl;
  id: string;
  data: Record<string, unknown>;
  deleted?: boolean;
}

interface DbRow extends Row {
  version: number;
  client_id: string | null;
}

/** One change to send: a record written or retired. */
export interface Change {
  coll: SyncedColl;
  id: string;
  data: Record<string, unknown>;
  deleted: boolean;
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** What changed between two snapshots, per record (pure; unit-tested). */
export function diffDB(prev: Pick<DB, SyncedColl>, next: Pick<DB, SyncedColl>): Change[] {
  const out: Change[] = [];
  for (const coll of COLLS) {
    const a = prev[coll] as unknown[];
    const b = next[coll] as unknown[];
    if (a === b) continue;
    const before = new Map(a.map((x) => [keyOf(coll, x), x]));
    const seen = new Set<string>();
    for (const x of b) {
      const id = keyOf(coll, x);
      seen.add(id);
      const old = before.get(id);
      if (old === x || (old !== undefined && same(old, x))) continue;
      out.push({ coll, id, data: x as Record<string, unknown>, deleted: false });
    }
    for (const [id, x] of before) if (!seen.has(id)) out.push({ coll, id, data: x as Record<string, unknown>, deleted: true });
  }
  return out;
}

/** Apply rows from the database to a snapshot: replace in place, append new ones, drop retired ones (pure; unit-tested). */
export function applyRows<T extends Pick<DB, SyncedColl>>(db: T, rows: Row[]): T {
  const byColl = new Map<SyncedColl, Row[]>();
  for (const r of rows) {
    if (!(r.coll in SYNCED)) continue;
    byColl.set(r.coll, [...(byColl.get(r.coll) ?? []), r]);
  }
  if (!byColl.size) return db;
  const next = { ...db };
  for (const [coll, rs] of byColl) {
    const list = [...(db[coll] as unknown[])];
    const index = new Map(list.map((x, i) => [keyOf(coll, x), i]));
    const drop = new Set<number>();
    for (const r of rs) {
      const i = index.get(r.id);
      if (r.deleted) {
        if (i !== undefined) drop.add(i);
        continue;
      }
      // contact details live in app_private: keep the email this device already knows
      let data: unknown = r.data;
      if (coll === 'players' && i !== undefined) {
        const email = (list[i] as Player).email;
        if (email && !(r.data as Partial<Player>).email) data = { ...r.data, email };
      }
      if (i === undefined) {
        index.set(r.id, list.length);
        list.push(data);
      } else {
        drop.delete(i);
        list[i] = data;
      }
    }
    (next as Record<string, unknown>)[coll] = drop.size ? list.filter((_, i) => !drop.has(i)) : list;
  }
  return next;
}

/** Order the rows of one player's registration so app_submit can check each against the ones before it. */
const SUBMIT_ORDER: Record<string, number> = { players: 0, private: 1, entries: 2, registrations: 3 };

// ---------------------------------------------------------------------------
// Status shown by the app (loading screen, "saving…" and offline hints)
// ---------------------------------------------------------------------------
export interface RemoteState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Realtime connected (otherwise the app polls). */
  live: boolean;
  /** Changes not yet saved to the database. */
  pending: number;
  error?: string;
}
export const useRemote = create<RemoteState>()(() => ({ status: 'idle', live: false, pending: 0 }));

// ---------------------------------------------------------------------------
// The sync engine
// ---------------------------------------------------------------------------
const CLIENT_ID = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
const PAGE = 1000;
const POLL_MS = 15_000;
const SAFETY_POLL_MS = 60_000;
/**
 * Catch-up reads again a few versions before the newest one seen: a write that took a version
 * number first but committed after a later one is not skipped. Rows already seen are ignored.
 */
const OVERLAP = 50;
const COLUMNS = 'coll,id,data,deleted,version,client_id';
/** Unsaved changes are kept in the tab's session storage (per account), so a reload doesn't lose them. */
const pendingKey = (user: string) => `${STORAGE_KEYS.pending}.${user}`;

/** One unsaved change; `base` is the database version of the record the edit started from. */
interface Pending extends Change {
  base: number;
}

let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let channelSeq = 0;
let lastSynced: Pick<DB, SyncedColl> | null = null;
let applying = false;
let maxVersion = 0;
let privMaxVersion = 0;
/** The newest database version this device has of each record ("coll:id"): loaded, received or written. */
const versions = new Map<string, number>();
/** Unsaved changes by "coll:id" (the newest wins). */
const queue = new Map<string, Pending>();
/** The account the queued changes belong to. */
let queueOwner: string | null = null;
/** This tab, and the tab that queued changes before a reload: rows they wrote are not someone else's. */
const ownClients = new Set([CLIENT_ID]);
/** Records another device changed while ours were on their way: read again once ours are saved. */
const stale = new Set<string>();
/** Check the queue against the database before sending it (after an outage or a reload). */
let recheck = false;
let flushing: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 2000;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let loadSeq = 0;
let loadTimer: ReturnType<typeof setTimeout> | undefined;
let loadDelay = 3000;
/** Changes the database refused (counted so a caller can tell whether its own change went through). */
let refusals = 0;

const isStaff = () => useAuth.getState().access.memberships.length > 0;
const syncedPart = (s: DB): Pick<DB, SyncedColl> => Object.fromEntries(COLLS.map((c) => [c, s[c]])) as Pick<DB, SyncedColl>;
const rowKey = (r: { coll: string; id: string }) => `${r.coll}:${r.id}`;
const setPending = () => useRemote.setState({ pending: queue.size });

function persistQueue() {
  if (!queueOwner) return;
  if (queue.size)
    safeSessionStorage.set(pendingKey(queueOwner), JSON.stringify({ clients: [...ownClients], changes: [...queue.values()] }));
  else safeSessionStorage.remove(pendingKey(queueOwner));
}

/** The queue follows the signed-in account: another account's unsaved changes wait in storage for it. */
function adoptQueue(user: string | null) {
  if (user === queueOwner) return;
  queue.clear();
  stale.clear();
  queueOwner = user;
  if (user) {
    try {
      const kept = JSON.parse(safeSessionStorage.get(pendingKey(user)) ?? 'null') as { clients?: string[]; changes?: Pending[] } | null;
      for (const c of kept?.changes ?? []) if (c && c.coll in SYNCED && typeof c.id === 'string') queue.set(rowKey(c), c);
      for (const id of kept?.clients ?? []) ownClients.add(id);
    } catch {
      /* unreadable: nothing to restore */
    }
    // made before the reload: someone may have changed the same records since
    if (queue.size) recheck = true;
  }
  setPending();
}

/** Replace store data without echoing it back to the database. */
function applyToStore(patch: Partial<DB>) {
  applying = true;
  try {
    useStore.setState(patch);
  } finally {
    applying = false;
  }
  lastSynced = syncedPart(useStore.getState());
}

async function fetchAll(sb: SupabaseClient): Promise<{ rows: DbRow[]; max: number }> {
  const rows: DbRow[] = [];
  let max = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('app_entities')
      .select(COLUMNS)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data as DbRow[]) {
      max = Math.max(max, Number(r.version));
      rows.push(r);
    }
    if (data.length < PAGE) break;
  }
  return { rows, max };
}

/** The current database rows of some records ("coll:id"). */
async function fetchKeys(sb: SupabaseClient, keys: string[]): Promise<DbRow[]> {
  const byColl = new Map<string, string[]>();
  for (const k of keys) {
    const i = k.indexOf(':');
    byColl.set(k.slice(0, i), [...(byColl.get(k.slice(0, i)) ?? []), k.slice(i + 1)]);
  }
  const out: DbRow[] = [];
  for (const [coll, ids] of byColl) {
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await sb
        .from('app_entities')
        .select(COLUMNS)
        .eq('coll', coll)
        .in('id', ids.slice(i, i + 100));
      if (error) throw error;
      out.push(...(data as DbRow[]));
    }
  }
  return out;
}

/** Read some records again and show what the database has. */
async function refresh(keys: string[]) {
  if (!client || !keys.length) return;
  try {
    receive(await fetchKeys(client, keys));
  } catch (e) {
    reportError(e, { source: 'remote.refresh' });
  }
}

/** Contact details (staff, and each player for their own record). */
async function fetchPrivate(sb: SupabaseClient, since: number) {
  if (!useAuth.getState().user) return;
  const { data, error } = await sb.from('app_private').select('id,data,version').gt('version', since).order('version');
  if (error || !data?.length) return;
  privMaxVersion = Math.max(privMaxVersion, ...data.map((r) => Number(r.version)));
  const emails = new Map(data.map((r) => [r.id as string, (r.data as { email?: string }).email]));
  const players = useStore.getState().players.map((p) => (emails.has(p.id) ? { ...p, email: emails.get(p.id) ?? p.email } : p));
  applyToStore({ players });
}

/** Staff: the organization, its team and pending invites. */
async function fetchTeam(sb: SupabaseClient) {
  const { access, user } = useAuth.getState();
  if (!user || !access.memberships.length) {
    applyToStore({ organizations: [], members: [], profiles: [], orgInvites: [] });
    return;
  }
  const orgIds = access.memberships.map((m) => m.orgId);
  const orgs = await sb.from('organizations').select('id,name,slug').in('id', orgIds);
  const members: Membership[] = [];
  const profiles: Profile[] = [];
  for (const orgId of orgIds) {
    const team = await sb.rpc('org_team', { p_org: orgId });
    for (const m of (team.data ?? []) as { user_id: string; role: Role; name: string; email: string }[]) {
      members.push({ orgId, userId: m.user_id, role: m.role });
      if (!profiles.some((p) => p.id === m.user_id)) profiles.push({ id: m.user_id, name: m.name, email: m.email });
    }
  }
  const inv = await sb.from('organization_invites').select('id,organization_id,email,role,created_at').is('accepted_at', null);
  applyToStore({
    organizations: ((orgs.data ?? []) as Organization[]).map((o) => ({ id: o.id, name: o.name, slug: o.slug })),
    members,
    profiles,
    orgInvites: ((inv.data ?? []) as { id: string; organization_id: string; email: string; role: Role; created_at: string }[]).map((i) => ({
      id: i.id,
      orgId: i.organization_id,
      email: i.email,
      role: i.role,
      at: Date.parse(i.created_at),
    })),
  });
}

/** Load everything this account may see. */
export async function reload(): Promise<void> {
  const sb = client ?? (client = await getSupabase());
  const seq = ++loadSeq;
  clearTimeout(loadTimer);
  if (useRemote.getState().status !== 'ready') useRemote.setState({ status: 'loading' });
  try {
    const { rows, max } = await fetchAll(sb);
    if (seq !== loadSeq) return;
    maxVersion = Math.max(maxVersion, max);
    privMaxVersion = 0;
    // A record this device got (or wrote) while the load was under way is newer than what the load read.
    const current = syncedPart(useStore.getState());
    const local = (key: string): Row => {
      const i = key.indexOf(':');
      const coll = key.slice(0, i) as SyncedColl;
      const id = key.slice(i + 1);
      const data = (current[coll] as unknown[]).find((x) => keyOf(coll, x) === id) as Record<string, unknown> | undefined;
      return data ? { coll, id, data } : { coll, id, data: {}, deleted: true };
    };
    const use: Row[] = [];
    const read = new Set<string>();
    for (const r of rows) {
      if (!(r.coll in SYNCED)) continue;
      const key = rowKey(r);
      read.add(key);
      if ((versions.get(key) ?? 0) > Number(r.version)) use.push(local(key));
      else {
        versions.set(key, Number(r.version));
        if (!r.deleted) use.push(r);
      }
    }
    for (const [key, v] of versions) if (v > max && !read.has(key)) use.push(local(key));
    const empty = Object.fromEntries(COLLS.map((c) => [c, []])) as unknown as Pick<DB, SyncedColl>;
    // keep changes that are still on their way to the database
    let next = applyRows(empty, use);
    next = applyRows(next, [...queue.values()]);
    applyToStore(next);
    await Promise.all([fetchPrivate(sb, 0), fetchTeam(sb)]);
    loadDelay = 3000;
    useRemote.setState({ status: 'ready', error: undefined });
    if (queue.size) void flush();
  } catch (e) {
    reportError(e, { source: 'remote.reload' });
    if (seq !== loadSeq || useRemote.getState().status === 'ready') return;
    useRemote.setState({ status: 'error', error: 'Can’t reach the server. Check your connection and try again.' });
    // the hall TV has nobody to press "Try again": keep trying
    loadTimer = setTimeout(() => void reload(), loadDelay);
    loadDelay = Math.min(loadDelay * 2, 30_000);
  }
}

/** Fetch whatever changed since the last version this device saw. */
async function catchUp() {
  if (!client || useRemote.getState().status !== 'ready') return;
  try {
    const { data, error } = await client
      .from('app_entities')
      .select(COLUMNS)
      .gt('version', Math.max(0, maxVersion - OVERLAP))
      .order('version')
      .limit(PAGE);
    if (error) throw error;
    receive(data as DbRow[]);
    if (data.length === PAGE) void catchUp();
    await fetchPrivate(client, privMaxVersion);
  } catch (e) {
    reportError(e, { source: 'remote.catchUp' });
  }
}

/** Rows from the database (realtime, catch-up or a refresh). */
function receive(rows: DbRow[]) {
  const fresh: Row[] = [];
  const incomplete: string[] = [];
  for (const r of rows) {
    const v = Number(r.version);
    if (v > maxVersion) maxVersion = v;
    if (!(r.coll in SYNCED)) continue;
    const key = rowKey(r);
    // already have this version or a newer one
    if (v <= (versions.get(key) ?? 0)) continue;
    // Realtime can leave out a large value that didn't change: read the record instead
    if (!r.deleted && (!r.data || typeof r.data !== 'object')) {
      incomplete.push(key);
      continue;
    }
    // changed again here since: the local copy is newer for now, and is read again once it is saved
    if (queue.has(key)) {
      if (!ownClients.has(r.client_id ?? '')) stale.add(key);
      continue;
    }
    versions.set(key, v);
    // our own echo: the local copy is the same
    if (r.client_id === CLIENT_ID) continue;
    fresh.push(r);
  }
  if (incomplete.length) void refresh(incomplete);
  if (!fresh.length) return;
  const next = applyRows(syncedPart(useStore.getState()), fresh);
  applyToStore(next);
}

function subscribe() {
  if (!client) return;
  if (channel) void client.removeChannel(channel);
  // a new topic each time: the client hands out a channel that is still leaving if the name is reused
  const mine: RealtimeChannel = client
    .channel(`app-${CLIENT_ID}-${++channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_entities' }, (payload) => {
      if (payload.new && 'coll' in payload.new) receive([payload.new as DbRow]);
    })
    .subscribe((status) => {
      if (channel !== mine) return; // an earlier subscription closing
      const live = status === 'SUBSCRIBED';
      useRemote.setState({ live });
      // anything missed while connecting or disconnected
      if (live) void catchUp();
    });
  channel = mine;
}

function schedulePolling() {
  clearInterval(pollTimer);
  let last = 0;
  pollTimer = setInterval(() => {
    const now = Date.now();
    const { live } = useRemote.getState();
    if (document.visibilityState !== 'visible') return;
    if (!live || now - last >= SAFETY_POLL_MS) {
      last = now;
      void catchUp();
    }
  }, POLL_MS);
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------
function enqueue(user: string, changes: Change[]) {
  if (queueOwner !== user) adoptQueue(user);
  for (const c of changes) {
    const key = rowKey(c);
    queue.set(key, { ...c, base: queue.get(key)?.base ?? versions.get(key) ?? 0 });
  }
  persistQueue();
  setPending();
  void flush();
}

const publicData = (c: Change) => {
  if (c.coll !== 'players') return c.data;
  const { email: _email, ...rest } = c.data as Partial<Player> & Record<string, unknown>;
  return rest;
};

async function send(sb: SupabaseClient, batch: Change[]) {
  if (isStaff()) {
    for (let i = 0; i < batch.length; i += 200) {
      const part = batch.slice(i, i + 200);
      const { data, error } = await sb
        .from('app_entities')
        .upsert(
          part.map((c) => ({ coll: c.coll, id: c.id, data: publicData(c), deleted: c.deleted, client_id: CLIENT_ID })),
          { onConflict: 'coll,id' },
        )
        .select('coll,id,version');
      if (error) throw error;
      for (const r of (data ?? []) as { coll: string; id: string; version: number }[])
        versions.set(rowKey(r), Math.max(versions.get(rowKey(r)) ?? 0, Number(r.version)));
    }
    const priv = batch.filter((c) => c.coll === 'players' && !c.deleted && (c.data as Partial<Player>).email);
    if (priv.length) {
      const { error } = await sb.from('app_private').upsert(
        priv.map((c) => ({
          id: c.id,
          data: { email: (c.data as Partial<Player>).email },
          ...((c.data as Partial<Player>).userId ? { user_id: (c.data as Partial<Player>).userId } : {}),
        })),
        { onConflict: 'id' },
      );
      if (error) throw error;
    }
    return;
  }
  // players: only their own registration goes through
  const me = useAuth.getState().user?.id;
  const rows: { coll: string; id: string; data: Record<string, unknown> }[] = [];
  for (const c of batch) {
    if (c.deleted || !(c.coll in SUBMIT_ORDER)) continue;
    rows.push({ coll: c.coll, id: c.id, data: publicData(c) });
    const email = (c.data as Partial<Player>).email;
    if (c.coll === 'players' && email && (c.data as Partial<Player>).userId === me)
      rows.push({ coll: 'private', id: c.id, data: { id: c.id, email } });
  }
  if (!rows.length) return;
  rows.sort((a, b) => SUBMIT_ORDER[a.coll] - SUBMIT_ORDER[b.coll]);
  const { error } = await sb.rpc('app_submit', { p_rows: rows, p_client: CLIENT_ID });
  if (error) throw error;
}

/**
 * Changes made offline (or before a reload) go out later than they were made: leave out those whose
 * record someone else changed in the meantime, and show that version instead. Otherwise a phone
 * coming back online would put an old live score over the result the desk has saved since.
 */
async function dropConflicts(sb: SupabaseClient, batch: Pending[]): Promise<Pending[]> {
  const now = new Map((await fetchKeys(sb, batch.map(rowKey))).map((r) => [rowKey(r), r]));
  const lost: DbRow[] = [];
  for (const c of batch) {
    const r = now.get(rowKey(c));
    if (!r || Number(r.version) <= c.base || ownClients.has(r.client_id ?? '')) continue;
    if (queue.get(rowKey(c)) === c) queue.delete(rowKey(c));
    lost.push(r);
  }
  if (!lost.length) return batch;
  persistQueue();
  setPending();
  receive(lost);
  toast('Some changes were not saved', {
    tone: 'error',
    detail: `${lost.length} ${lost.length === 1 ? 'record was' : 'records were'} changed on another device while this one was offline. Check the latest scores.`,
  });
  return batch.filter((c) => queue.get(rowKey(c)) === c);
}

/** Refusals (permissions, validation) won't succeed on retry: show why and reload the real data. */
const refused = (e: unknown) => {
  const err = e as { code?: string; message?: string };
  return (
    err?.code === '42501' ||
    err?.code === 'P0001' ||
    err?.code === '23514' ||
    err?.code === '23505' ||
    /row-level security/i.test(err?.message ?? '')
  );
};

const friendly = (e: unknown) => {
  const err = e as { details?: string; message?: string };
  if (err?.details) return err.details;
  if (/row-level security|not_allowed/i.test(err?.message ?? '')) return 'You don’t have permission to change that.';
  return err?.message || 'The change was refused.';
};

/** Take saved (or refused) changes off the queue; anything changed again while sending stays. */
function settle(batch: Pending[], ok: boolean) {
  for (const c of batch) {
    const key = rowKey(c);
    const now = queue.get(key);
    if (now === c) queue.delete(key);
    // changed again while sending: that edit now builds on what was just written
    else if (now && ok) now.base = versions.get(key) ?? now.base;
  }
  persistQueue();
  setPending();
  // another device wrote some of these meanwhile: show whichever write the database kept
  const again = batch.map(rowKey).filter((k) => stale.has(k) && !queue.has(k));
  for (const k of again) stale.delete(k);
  if (again.length) void refresh(again);
}

async function flush(): Promise<void> {
  if (flushing || !queue.size) return flushing ?? undefined;
  const sb = client ?? (client = await getSupabase());
  flushing = (async () => {
    // after a refusal, send one change at a time so the rest still goes through
    let oneByOne = false;
    let refusal: unknown = null;
    let refusedCount = 0;
    while (queue.size) {
      let batch: Pending[] = oneByOne ? [queue.values().next().value as Pending] : [...queue.values()];
      try {
        if (recheck && isStaff()) batch = await dropConflicts(sb, batch);
        recheck = false;
        if (!batch.length) continue;
        await send(sb, batch);
        settle(batch, true);
        retryDelay = 2000;
      } catch (e) {
        if (refused(e)) {
          if (batch.length > 1 && isStaff()) {
            oneByOne = true;
            continue;
          }
          refusals++;
          refusedCount++;
          refusal = e;
          settle(batch, false);
          reportError(e, { source: 'remote.refused' });
          continue;
        }
        reportError(e, { source: 'remote.flush' });
        if (retryDelay === 2000) toast('Offline: changes will be saved when the connection is back', { tone: 'info' });
        // the changes now go out late: check them against the database first
        recheck = true;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => void flush(), retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
        break;
      }
    }
    if (refusal) {
      toast('Not saved', {
        tone: 'error',
        detail: refusedCount > 1 ? `${friendly(refusal)} (${refusedCount} changes)` : friendly(refusal),
      });
      void reload();
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Wait until every local change is in the database (or the attempt failed). */
export async function saved(): Promise<boolean> {
  const before = refusals;
  await flush();
  while (flushing) await flushing;
  return queue.size === 0 && refusals === before;
}

// ---------------------------------------------------------------------------
// Team (organization_members / organization_invites)
// ---------------------------------------------------------------------------
async function teamCall(run: (sb: SupabaseClient) => PromiseLike<{ error: unknown }>, ok?: string) {
  const sb = client ?? (client = await getSupabase());
  const { error } = await run(sb);
  if (error) toast('Not saved', { tone: 'error', detail: friendly(error) });
  else if (ok) toast(ok);
  await fetchTeam(sb);
}

export const remoteTeam = {
  invite: (orgId: string, email: string, role: Role) =>
    teamCall((sb) => sb.from('organization_invites').insert({ organization_id: orgId, email: email.trim().toLowerCase(), role })),
  cancelInvite: (id: string) => teamCall((sb) => sb.from('organization_invites').delete().eq('id', id)),
  setRole: (orgId: string, userId: string, role: Role) =>
    teamCall((sb) => sb.rpc('org_set_role', { p_org: orgId, p_user: userId, p_role: role })),
  remove: (orgId: string, userId: string) => teamCall((sb) => sb.rpc('org_remove_member', { p_org: orgId, p_user: userId })),
};

/** Re-exported for the store's team actions (keeps the store free of network code). */
export type { OrgInvite };

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
let started = false;

export function startRemoteSync(): void {
  if (started) return;
  started = true;

  // local edits → database
  useStore.subscribe((state) => {
    if (applying || !lastSynced) return;
    const next = syncedPart(state);
    const changes = diffDB(lastSynced, next);
    lastSynced = next;
    const user = useAuth.getState().user;
    if (changes.length && user) enqueue(user.id, changes);
  });

  // sign-in/out changes what this account may see
  let who: string | null | undefined;
  let roles = '';
  const follow = (id: string | null, r: string) => {
    who = id;
    roles = r;
    adoptQueue(id);
    void reload().then(subscribe);
  };
  const rolesOf = (s: ReturnType<typeof useAuth.getState>) => s.access.memberships.map((m) => `${m.orgId}:${m.role}`).join(',');
  useAuth.subscribe((s) => {
    if (s.status === 'loading') return;
    const id = s.user?.id ?? null;
    const r = rolesOf(s);
    if (id === who && r === roles) return;
    follow(id, r);
  });

  window.addEventListener('beforeunload', (e) => {
    if (queue.size) e.preventDefault();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void catchUp();
  });
  window.addEventListener('online', () => {
    if (useRemote.getState().status === 'error') void reload();
    void flush();
    void catchUp();
  });
  schedulePolling();

  // first load as soon as auth knows who this is
  const auth = useAuth.getState();
  if (auth.status !== 'loading') follow(auth.user?.id ?? null, rolesOf(auth));
}
