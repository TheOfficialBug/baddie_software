// Live data with Supabase. Every record of the data snapshot is a row in `app_entities`
// (see supabase/migrations/20261017120000_app_entities.sql):
//  - on start (and on sign-in/out) the snapshot is loaded from the database;
//  - changes made through the store are diffed against what the database last had and written back
//    (staff directly; players through `app_submit`, which only accepts their own registration);
//  - other devices' changes arrive through Supabase Realtime, with a catch-up query by `version`
//    when the connection drops, so phones, the hall TV and the desk stay in step.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';

import type { Player } from '@/engine/types';

import { reportError } from '@/lib/monitoring';
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
    const list = byColl.get(r.coll);
    if (list) list.push(r);
    else byColl.set(r.coll, [r]);
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
const INBOX_MS = 40;

let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let lastSynced: Pick<DB, SyncedColl> | null = null;
let applying = false;
let maxVersion = 0;
let privMaxVersion = 0;
/** Unsaved changes by "coll:id" (the newest wins). */
const queue = new Map<string, Change>();
let flushing: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 2000;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let loadSeq = 0;
/** Realtime rows waiting to be applied together (see receive). */
let inbox: Row[] = [];
let inboxTimer: ReturnType<typeof setTimeout> | undefined;
/** Changes the database refused (counted so a caller can tell whether its own change went through). */
let refusals = 0;

const isStaff = () => useAuth.getState().access.memberships.length > 0;
const syncedPart = (s: DB): Pick<DB, SyncedColl> => Object.fromEntries(COLLS.map((c) => [c, s[c]])) as Pick<DB, SyncedColl>;
const setPending = () => useRemote.setState({ pending: queue.size });

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
  // Retired records (redraws and resets leave many) are skipped by the query instead of downloaded. The newest
  // version, retired ones included, is read first: whatever changes while the pages load is newer and gets caught up.
  const newest = await sb.from('app_entities').select('version').order('version', { ascending: false }).limit(1);
  if (newest.error) throw newest.error;
  const max = Number((newest.data as { version: number }[])[0]?.version ?? 0);
  const rows: DbRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('app_entities')
      .select('coll,id,data,deleted,version,client_id')
      .eq('deleted', false)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data as DbRow[]));
    if (data.length < PAGE) break;
  }
  return { rows, max };
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
  if (useRemote.getState().status !== 'ready') useRemote.setState({ status: 'loading' });
  try {
    const { rows, max } = await fetchAll(sb);
    if (seq !== loadSeq) return;
    maxVersion = max;
    privMaxVersion = 0;
    const empty = Object.fromEntries(COLLS.map((c) => [c, []])) as unknown as Pick<DB, SyncedColl>;
    // keep changes that are still on their way to the database
    let next = applyRows(empty, rows);
    next = applyRows(next, [...queue.values()]);
    // realtime rows still waiting would be replaced by the snapshot anyway
    clearTimeout(inboxTimer);
    inboxTimer = undefined;
    inbox = [];
    applyToStore(next);
    await Promise.all([fetchPrivate(sb, 0), fetchTeam(sb)]);
    useRemote.setState({ status: 'ready', error: undefined });
  } catch (e) {
    reportError(e, { source: 'remote.reload' });
    if (useRemote.getState().status !== 'ready')
      useRemote.setState({ status: 'error', error: 'Can’t reach the server. Check your connection and try again.' });
  }
}

/** Fetch whatever changed since the last version this device saw. */
async function catchUp() {
  if (!client || useRemote.getState().status !== 'ready') return;
  try {
    const { data, error } = await client
      .from('app_entities')
      .select('coll,id,data,deleted,version,client_id')
      .gt('version', maxVersion)
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

/**
 * Rows from the database (realtime or catch-up). Realtime sends one message per row, and one action at the
 * desk writes several (a result, the matches it decides, the undo record, a notice): rows arriving within
 * INBOX_MS are applied together, so every open page renders once per action instead of once per row.
 */
function receive(rows: DbRow[], batched = false) {
  for (const r of rows) {
    const v = Number(r.version);
    if (v > maxVersion) maxVersion = v;
    // our own echo, or something we changed again since: the local copy is newer
    if (r.client_id === CLIENT_ID || queue.has(`${r.coll}:${r.id}`)) continue;
    inbox.push(r);
  }
  if (!batched) applyInbox();
  else if (inbox.length && inboxTimer === undefined) inboxTimer = setTimeout(applyInbox, INBOX_MS);
}

function applyInbox() {
  clearTimeout(inboxTimer);
  inboxTimer = undefined;
  const fresh = inbox;
  inbox = [];
  if (!fresh.length) return;
  applyToStore(applyRows(syncedPart(useStore.getState()), fresh));
}

function subscribe() {
  if (!client) return;
  if (channel) void client.removeChannel(channel);
  channel = client
    .channel(`app-${CLIENT_ID}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_entities' }, (payload) => {
      if (payload.new && 'coll' in payload.new) receive([payload.new as DbRow], true);
    })
    .subscribe((status) => {
      const live = status === 'SUBSCRIBED';
      useRemote.setState({ live });
      // anything missed while connecting or disconnected
      if (live) void catchUp();
    });
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
function enqueue(changes: Change[]) {
  for (const c of changes) queue.set(`${c.coll}:${c.id}`, c);
  // a local edit is newer than any row still waiting in the inbox
  if (inbox.length) inbox = inbox.filter((r) => !queue.has(`${r.coll}:${r.id}`));
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
      const { error } = await sb.from('app_entities').upsert(
        part.map((c) => ({ coll: c.coll, id: c.id, data: publicData(c), deleted: c.deleted, client_id: CLIENT_ID })),
        { onConflict: 'coll,id' },
      );
      if (error) throw error;
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

async function flush(): Promise<void> {
  if (flushing || !queue.size) return flushing ?? undefined;
  const sb = client ?? (client = await getSupabase());
  flushing = (async () => {
    while (queue.size) {
      const batch = [...queue.values()];
      try {
        await send(sb, batch);
        // keep anything changed again while sending
        for (const c of batch) if (queue.get(`${c.coll}:${c.id}`) === c) queue.delete(`${c.coll}:${c.id}`);
        retryDelay = 2000;
        setPending();
      } catch (e) {
        if (refused(e)) {
          refusals++;
          for (const c of batch) if (queue.get(`${c.coll}:${c.id}`) === c) queue.delete(`${c.coll}:${c.id}`);
          setPending();
          toast('Not saved', { tone: 'error', detail: friendly(e) });
          reportError(e, { source: 'remote.refused' });
          void reload();
          continue;
        }
        reportError(e, { source: 'remote.flush' });
        if (retryDelay === 2000) toast('Offline: changes will be saved when the connection is back', { tone: 'info' });
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => void flush(), retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
        break;
      }
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
    if (changes.length && useAuth.getState().user) enqueue(changes);
  });

  // sign-in/out changes what this account may see
  let who: string | null | undefined;
  let roles = '';
  useAuth.subscribe((s) => {
    if (s.status === 'loading') return;
    const id = s.user?.id ?? null;
    const r = s.access.memberships.map((m) => `${m.orgId}:${m.role}`).join(',');
    if (id === who && r === roles) return;
    who = id;
    roles = r;
    void reload().then(subscribe);
  });

  window.addEventListener('beforeunload', (e) => {
    if (queue.size) e.preventDefault();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void catchUp();
  });
  window.addEventListener('online', () => {
    void flush();
    void catchUp();
  });
  schedulePolling();

  // first load as soon as auth knows who this is
  if (useAuth.getState().status !== 'loading') {
    who = useAuth.getState().user?.id ?? null;
    roles = useAuth
      .getState()
      .access.memberships.map((m) => `${m.orgId}:${m.role}`)
      .join(',');
    void reload().then(subscribe);
  }
}
