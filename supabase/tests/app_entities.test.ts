// The live app data tables (app_entities / app_private): who can read and write what, and the
// player registration path (app_submit) refusing anything but the player's own, pending entries.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATIONS = join(__dirname, '../../supabase/migrations');

const AUTH_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz default now(), raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

let db: PGlite;
const users = { owner: randomUUID(), scorer: randomUUID(), player: randomUUID(), other: randomUUID() };
const emails = { owner: 'kunals@iastate.edu', scorer: 'scorer@example.com', player: 'player@example.com', other: 'other@example.com' };

async function as<T>(who: keyof typeof users | 'anon', fn: () => Promise<T>): Promise<T> {
  await db.exec(
    who === 'anon'
      ? `select set_config('request.jwt.claim.sub', '', false); set role anon;`
      : `select set_config('request.jwt.claim.sub', '${users[who]}', false); set role authenticated;`,
  );
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

async function rejects(fn: () => Promise<unknown>, re: RegExp) {
  let err: unknown;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  expect(err, `expected an error matching ${re}`).toBeTruthy();
  expect(`${(err as Error).message} ${(err as { detail?: string }).detail ?? ''}`).toMatch(re);
}

const put = (coll: string, id: string, data: Record<string, unknown>) =>
  db.query(`insert into public.app_entities (coll, id, data) values ($1, $2, $3::jsonb)`, [coll, id, JSON.stringify({ id, ...data })]);
const submit = (rows: unknown[]) => db.query(`select public.app_submit($1::jsonb, 'tab-1')`, [JSON.stringify(rows)]);
const read = async (coll: string, id: string) =>
  (await db.query<{ data: Record<string, unknown> }>(`select data from public.app_entities where coll = $1 and id = $2`, [coll, id]))
    .rows[0]?.data;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const f of readdirSync(MIGRATIONS)
    .filter((x) => x.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  for (const k of Object.keys(users) as (keyof typeof users)[])
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [users[k], emails[k]]);

  // the owner signs in: the seeded invite makes them owner; they add a scorer
  await as('owner', () => db.query(`select public.accept_my_invites()`));
  const org = (await db.query<{ id: string }>(`select id from public.organizations where slug = 'smashboard'`)).rows[0].id;
  await db.query(`insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'scorer')`, [org, users.scorer]);

  await as('owner', async () => {
    await put('tournaments', 't1', { status: 'registration', name: 'Fall Open' });
    await put('tournaments', 't2', { status: 'closed', name: 'Old Cup' });
    await put('tournaments', 't3', { status: 'registration', name: 'Past Cup', regCloses: '2020-01-01' });
    await put('events', 'ev3', { tournamentId: 't3', kind: 'MS' });
    await put('events', 'ev1', { tournamentId: 't1', kind: 'MS' });
    await put('events', 'ev2', { tournamentId: 't2', kind: 'MS' });
    await put('updates', 'u1', { matchId: 'm1' });
    await put('players', 'p-imported', { name: 'Imported Player' });
    await db.query(`insert into public.app_private (id, data) values ('p-imported', '{"email":"player@example.com"}')`);
  });
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe('organizer account', () => {
  it('the seeded invite makes kunals@iastate.edu the owner', async () => {
    const role = await as('owner', async () => (await db.query<{ r: string }>(`select public.app_role() r`)).rows[0].r);
    expect(role).toBe('owner');
  });
});

describe('reading', () => {
  it('the public sees tournaments but not undo history or contact details', async () => {
    await as('anon', async () => {
      expect((await db.query(`select 1 from public.app_entities where coll = 'tournaments'`)).rows).toHaveLength(3);
      expect((await db.query(`select 1 from public.app_entities where coll = 'updates'`)).rows).toHaveLength(0);
    });
    await rejects(() => as('anon', () => db.query(`select * from public.app_private`)), /permission denied/);
    await as('player', async () => expect((await db.query(`select 1 from public.app_private`)).rows).toHaveLength(0));
  });

  it('staff see staff-only records and contact details', async () => {
    await as('scorer', async () => {
      expect((await db.query(`select 1 from public.app_entities where coll = 'updates'`)).rows).toHaveLength(1);
      expect((await db.query(`select 1 from public.app_private`)).rows).toHaveLength(1);
    });
  });
});

describe('writing', () => {
  it('the public and players cannot write directly', async () => {
    await rejects(() => as('anon', () => put('tournaments', 'tx', { status: 'live' })), /permission denied|row-level security/);
    await rejects(() => as('player', () => put('matches', 'mx', {})), /row-level security/);
    await as('player', () => db.query(`update public.app_entities set data = '{"id":"t1","status":"live"}' where id = 't1'`));
    expect((await read('tournaments', 't1'))?.status).toBe('registration');
  });

  it('scorers may change matches but not events', async () => {
    await as('scorer', () => put('matches', 'm1', { status: 'on_court' }));
    await rejects(() => as('scorer', () => put('events', 'ev9', { tournamentId: 't1' })), /row-level security/);
  });

  it('every change gets a newer version', async () => {
    const v = async () =>
      (await db.query<{ version: string }>(`select version from public.app_entities where coll = 'matches' and id = 'm1'`)).rows[0].version;
    const before = BigInt(await v());
    await as('scorer', () =>
      db.query(`update public.app_entities set data = '{"id":"m1","status":"finished"}' where coll = 'matches' and id = 'm1'`),
    );
    expect(BigInt(await v())).toBeGreaterThan(before);
  });
});

describe('player registration (app_submit)', () => {
  const me = { coll: 'players', id: 'p-me', data: { id: 'p-me', name: 'Me', userId: users.other, strength: 99, email: 'x@y.z' } };
  const entry = (id: string, eventId: string, extra = {}) => ({
    coll: 'entries',
    id,
    data: { id, eventId, playerIds: ['p-me'], status: 'accepted', seed: 1, ...extra },
  });

  it('registers a new player with pending entries, dropping rating, email and seed', async () => {
    await as('other', () =>
      submit([
        me,
        { coll: 'private', id: 'p-me', data: { id: 'p-me', email: 'other@example.com' } },
        entry('e1', 'ev1'),
        { coll: 'registrations', id: 'r1', data: { id: 'r1', tournamentId: 't1', playerId: 'p-me', entryIds: ['e1'], total: 20 } },
      ]),
    );
    const p = await read('players', 'p-me');
    expect(p?.strength).toBeUndefined();
    expect(p?.email).toBeUndefined();
    const e = await read('entries', 'e1');
    expect(e?.status).toBe('pending');
    expect(e?.seed).toBeUndefined();
    expect((await db.query(`select user_id from public.app_private where id = 'p-me'`)).rows[0]).toEqual({ user_id: users.other });
  });

  it('refuses a second entry in the same event, closed tournaments and other collections', async () => {
    await rejects(() => as('other', () => submit([entry('e2', 'ev1')])), /already_entered/);
    await rejects(() => as('other', () => submit([entry('e3', 'ev2')])), /registration_closed/);
    // still marked open, but the closing day has passed
    await rejects(() => as('other', () => submit([entry('e5', 'ev3')])), /registration_closed/);
    await rejects(() => as('other', () => submit([{ coll: 'matches', id: 'm1', data: { id: 'm1' } }])), /not_allowed/);
    await rejects(() => as('other', () => submit([entry('e1', 'ev1')])), /already exists/);
  });

  it('refuses changing or entering someone else', async () => {
    await rejects(
      () => as('player', () => submit([{ coll: 'players', id: 'p-me', data: { id: 'p-me', name: 'Hijack', userId: users.player } }])),
      /belongs to someone else/,
    );
    await rejects(() => as('player', () => submit([entry('e4', 'ev1')])), /only enter yourself/);
    await rejects(() => as('anon', () => submit([me])), /permission denied|not_signed_in/);
  });

  it('links an imported player to the account with the same verified email', async () => {
    const pid = await as('player', async () => (await db.query<{ pid: string }>(`select public.app_claim_player() pid`)).rows[0].pid);
    expect(pid).toBe('p-imported');
    expect((await read('players', 'p-imported'))?.userId).toBe(users.player);
    // and it's theirs from now on
    const again = await as('player', async () => (await db.query<{ pid: string }>(`select public.app_claim_player() pid`)).rows[0].pid);
    expect(again).toBe('p-imported');
  });
});

describe('team management', () => {
  it('lists the team for members only and keeps the last owner', async () => {
    const org = (await db.query<{ id: string }>(`select id from public.organizations where slug = 'smashboard'`)).rows[0].id;
    const team = await as('scorer', async () => (await db.query(`select * from public.org_team($1)`, [org])).rows);
    expect(team).toHaveLength(2);
    expect((await as('player', async () => (await db.query(`select * from public.org_team($1)`, [org])).rows)).length).toBe(0);
    await rejects(() => as('owner', () => db.query(`select public.org_set_role($1, $2, 'admin')`, [org, users.owner])), /last_owner/);
    await rejects(() => as('scorer', () => db.query(`select public.org_remove_member($1, $2)`, [org, users.owner])), /not_allowed/);
    await as('owner', () => db.query(`select public.org_set_role($1, $2, 'admin')`, [org, users.scorer]));
    expect(await as('scorer', async () => (await db.query<{ r: string }>(`select public.app_role() r`)).rows[0].r)).toBe('admin');
  });
});
