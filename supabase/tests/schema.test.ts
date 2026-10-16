// Validates supabase/migrations/*.sql against a real Postgres (PGlite):
//  1. the migration applies cleanly on top of a stand-in for Supabase's auth schema;
//  2. the app's full demo data (3 tournaments, every draw mode) imports without breaking any rule;
//  3. every invariant the database promises is actually enforced;
//  4. row level security gives each kind of user exactly the access intended.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { rulesIdForMatch } from '@/engine/rules';
import type { SlotSource } from '@/engine/types';

import { buildSampleData as buildDemo } from '@/test/fixtures/sampleTournaments';

const MIGRATIONS = join(__dirname, '../../supabase/migrations');

// Supabase provides these; PGlite needs a stand-in.
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
const ids = new Map<string, string>(); // demo string id -> uuid
const uuid = (k: string) => {
  if (!ids.has(k)) ids.set(k, randomUUID());
  return ids.get(k)!;
};
const users = { owner: randomUUID(), scorer: randomUUID(), outsider: randomUUID(), player: randomUUID() };
const demo = buildDemo(new Date('2026-10-08T15:00:00').getTime());
const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : null);

/** Run fn as a given user (or anonymously) with RLS applied, then go back to superuser. */
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

/** Expect a statement (or transaction) to fail with a message matching re. */
async function rejects(fn: () => Promise<unknown>, re: RegExp) {
  let err: unknown;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  expect(err, `expected an error matching ${re}`).toBeTruthy();
  const msg = `${(err as Error).message} ${(err as { detail?: string }).detail ?? ''}`;
  expect(msg).toMatch(re);
}

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const count = async (sql: string, params: unknown[] = []) => Number((await one<{ n: number }>(sql, params)).n);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const f of readdirSync(MIGRATIONS)
    .filter((x) => x.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

  for (const [k, v] of Object.entries(users))
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [v, `${k}@example.com`, { full_name: k }]);

  await db.transaction(async (tx) => {
    const q = (sql: string, p: unknown[]) => tx.query(sql, p);
    const org = randomUUID();
    await q(`insert into organizations (id, name, slug, created_by) values ($1, 'Prairie Badminton Club', 'prairie-bc', $2)`, [
      org,
      users.owner,
    ]);
    await q(`insert into organization_members (organization_id, user_id, role) values ($1, $2, 'scorer')`, [org, users.scorer]);

    const clubs = [...new Set(demo.players.map((p) => p.club))];
    for (const c of clubs) await q(`insert into clubs (id, name) values ($1, $2)`, [uuid(`club:${c}`), c]);

    for (const p of demo.players) {
      await q(`insert into players (id, full_name, gender, club_id, skill_level, profile_id, created_by) values ($1,$2,$3,$4,$5,$6,$7)`, [
        uuid(p.id),
        p.name,
        p.gender === 'M' ? 'male' : 'female',
        uuid(`club:${p.club}`),
        p.level,
        p.id === 'p-M5' ? users.player : null,
        users.owner,
      ]);
      await q(`insert into player_private (player_id, email, birth_year) values ($1,$2,$3)`, [
        uuid(p.id),
        `${p.id.toLowerCase()}@example.com`,
        p.birthYear,
      ]);
    }

    for (const t of demo.tournaments) {
      await q(
        `insert into tournaments (id, organization_id, slug, name, venue, city, start_date, end_date, status, registration_closes_at, rules_id, first_round_rules_id, rest_minutes, next_match_number, about)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          uuid(t.id),
          org,
          t.slug,
          t.name,
          t.venue,
          t.city,
          t.startDate,
          t.endDate,
          t.status,
          t.regCloses ? `${t.regCloses}T23:59:00Z` : null,
          t.rules,
          t.firstRound ?? null,
          t.restMinutes,
          t.nextMatchNumber,
          t.about ?? null,
        ],
      );
      for (const [i, c] of t.courts.entries())
        await q(`insert into courts (id, tournament_id, name, sort_order) values ($1,$2,$3,$4)`, [uuid(c.id), uuid(t.id), c.name, i]);
    }

    for (const ev of demo.events) {
      await q(
        `insert into events (id, tournament_id, kind, name, max_age, min_age, fee_cents, entry_cap, rules_id, first_round_rules_id, mode, group_size, advance, drop_variant, third_place, plate, seed_count, pairing, draw_state, draw_seed, published_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          uuid(ev.id),
          uuid(ev.tournamentId),
          ev.kind,
          ev.name,
          ev.maxAge ?? null,
          ev.minAge ?? null,
          Math.round(ev.fee * 100),
          ev.cap,
          ev.rules,
          ev.config.firstRound ?? null,
          ev.mode,
          ev.config.groupSize,
          ev.config.advance,
          ev.config.variant,
          ev.config.thirdPlace,
          ev.config.plate,
          ev.config.seeds,
          ev.config.pairing ?? 'balanced',
          ev.drawState,
          ev.drawSeed ?? null,
          ev.drawState === 'published' ? new Date().toISOString() : null,
        ],
      );
    }

    for (const e of demo.entries) {
      await q(`insert into entries (id, event_id, status, seed) values ($1,$2,$3,$4)`, [
        uuid(e.id),
        uuid(e.eventId),
        e.status,
        e.status === 'accepted' ? (e.seed ?? null) : null,
      ]);
      for (const [i, p] of e.playerIds.entries())
        await q(`insert into entry_players (entry_id, event_id, player_id, skill_level) values ($1,$2,$3,$4)`, [
          uuid(e.id),
          uuid(e.eventId),
          uuid(p),
          e.levels?.[i] ?? null,
        ]);
    }

    for (const s of demo.stages) {
      await q(`insert into stages (id, event_id, kind, name, flight, sort_order, size, rounds) values ($1,$2,$3,$4,$5,$6,$7,$8)`, [
        uuid(s.id),
        uuid(s.eventId),
        s.kind,
        s.name,
        s.flight ?? null,
        s.order,
        s.size,
        s.rounds,
      ]);
    }
    for (const [gi, g] of demo.groups.entries()) {
      await q(`insert into pools (id, stage_id, name, sort_order) values ($1,$2,$3,$4)`, [uuid(g.id), uuid(g.stageId), g.name, gi]);
      for (const [i, e] of g.entryIds.entries())
        await q(`insert into pool_members (pool_id, entry_id, position) values ($1,$2,$3)`, [uuid(g.id), uuid(e), i]);
    }

    const entryOrNull = (x: string | null) => (x && x !== 'BYE' ? uuid(x) : null);
    for (const m of demo.matches) {
      const ev = demo.events.find((e) => e.id === m.eventId)!;
      const st = demo.stages.find((s) => s.id === m.stageId);
      const onCourtLive = m.status === 'on_court' && m.live ? m.live : null;
      await q(
        `insert into matches (id, tournament_id, event_id, stage_id, pool_id, number, round, position, rules_id, entry_a_id, entry_b_id, status, court_id, called_at, started_at, finished_at, live_a, live_b, result, winner_side, loser_to)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          uuid(m.id),
          uuid(ev.tournamentId),
          uuid(m.eventId),
          uuid(m.stageId),
          m.groupId ? uuid(m.groupId) : null,
          m.number || null,
          m.round,
          m.index,
          rulesIdForMatch(ev, st, m, (id) => demo.matches.find((x) => x.id === id)),
          entryOrNull(m.a),
          entryOrNull(m.b),
          m.status,
          m.status === 'on_court' ? uuid(m.courtId!) : null,
          m.status === 'on_court' || m.status === 'finished' ? iso(m.calledAt) : null,
          iso(m.startedAt),
          m.status === 'finished' ? iso(m.finishedAt) : null,
          onCourtLive?.[0] ?? null,
          onCourtLive?.[1] ?? null,
          m.status === 'finished' ? (m.result ?? 'normal') : null,
          m.status === 'finished' || m.status === 'bye' ? (m.winner ?? null) : null,
          m.loserTo ?? null,
        ],
      );
      for (const [i, g] of m.games.entries())
        await q(`insert into match_games (match_id, game_no, points_a, points_b) values ($1,$2,$3,$4)`, [uuid(m.id), i + 1, g[0], g[1]]);
    }
    const src = async (matchId: string, side: 'a' | 'b', s: SlotSource) => {
      const v =
        s.kind === 'entry'
          ? ['entry', uuid(s.entryId), null, null, null]
          : s.kind === 'bye'
            ? ['bye', null, null, null, null]
            : s.kind === 'group'
              ? ['pool_rank', null, null, uuid(s.groupId), s.rank]
              : [s.kind, null, uuid(s.matchId), null, null];
      await q(
        `insert into match_sources (match_id, side, kind, entry_id, from_match_id, pool_id, pool_rank) values ($1,$2,$3,$4,$5,$6,$7)`,
        [uuid(matchId), side, ...v],
      );
    };
    for (const m of demo.matches) {
      await src(m.id, 'a', m.srcA);
      await src(m.id, 'b', m.srcB);
    }

    for (const n of demo.notices) {
      await q(
        `insert into notices (id, tournament_id, kind, audience, event_id, title, body, channels, created_by, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8::notice_channel[],$9,$10)`,
        [
          uuid(n.id),
          uuid(n.tournamentId),
          n.kind,
          n.audience,
          n.audience === 'event' ? uuid(n.eventId!) : null,
          n.title,
          n.body ?? null,
          `{${n.channels.join(',')}}`,
          users.owner,
          iso(n.at),
        ],
      );
      for (const p of n.playerIds ?? [])
        await q(`insert into notice_recipients (notice_id, player_id) values ($1,$2)`, [uuid(n.id), uuid(p)]);
    }

    // a draft tournament nobody outside the organization should see
    await q(
      `insert into tournaments (id, organization_id, slug, name, start_date, end_date) values ($1,$2,'secret-draft','Secret Draft Cup','2027-03-01','2027-03-01')`,
      [uuid('t-draft'), org],
    );
  });
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe('migration + demo import', () => {
  it('imports every row of the demo', async () => {
    expect(await count(`select count(*) n from tournaments`)).toBe(demo.tournaments.length + 1);
    expect(await count(`select count(*) n from events`)).toBe(demo.events.length);
    expect(await count(`select count(*) n from entries`)).toBe(demo.entries.length);
    expect(await count(`select count(*) n from matches`)).toBe(demo.matches.length);
    expect(await count(`select count(*) n from match_games`)).toBe(demo.matches.reduce((s, m) => s + m.games.length, 0));
    expect(await count(`select count(*) n from match_sources`)).toBe(demo.matches.length * 2);
    expect(await count(`select count(*) n from notices`)).toBe(demo.notices.length);
  });

  it('the owner of an organization becomes a member automatically, and auth users get profiles', async () => {
    expect((await one<{ role: string }>(`select role from organization_members where user_id = $1`, [users.owner])).role).toBe('owner');
    expect(await count(`select count(*) n from profiles`)).toBe(4);
  });

  it("each player's first match in the live tournament is one game to 30, everything after best of 3 to 21", async () => {
    const rows = (
      await db.query<{ stage: string; round: number; rules_id: string }>(
        `select distinct s.name stage, m.round, m.rules_id from matches m join stages s on s.id = m.stage_id join events e on e.id = m.event_id
      where e.tournament_id = $1 and e.mode <> 'round_robin' and m.status <> 'bye' order by 2`,
        [uuid('t-fall')],
      )
    ).rows;
    const top = (r: { stage: string }) => r.stage === 'A flight' || r.stage === 'Main draw' || r.stage === 'Knockout';
    // everyone's opening match
    expect(rows.filter((r) => top(r) && r.round === 1).every((r) => r.rules_id === 'ONE_30')).toBe(true);
    // by round 3 both players have always played
    expect(rows.filter((r) => top(r) && r.round >= 3).every((r) => r.rules_id === 'BWF_3x21')).toBe(true);
    // players in lower flights, the plate and the 3rd-place match have already played
    expect(rows.filter((r) => !top(r)).every((r) => r.rules_id === 'BWF_3x21')).toBe(true);
    expect(rows.some((r) => !top(r))).toBe(true);
    expect(rows.some((r) => top(r) && r.round === 1)).toBe(true);
  });
});

describe('invariants', () => {
  const liveMatch = () =>
    one<{ id: string; court_id: string; tournament_id: string }>(
      `select id, court_id, tournament_id from matches where status = 'on_court' limit 1`,
    );

  it('one match per court', async () => {
    const busy = await liveMatch();
    const ready = await one<{ id: string }>(`select id from matches where status = 'ready' and tournament_id = $1 limit 1`, [
      busy.tournament_id,
    ]);
    await rejects(
      () => db.query(`update matches set status = 'on_court', court_id = $1, called_at = now() where id = $2`, [busy.court_id, ready.id]),
      /matches_one_per_court|duplicate key|player_busy/,
    );
  });

  it('a player cannot be called while playing on another court', async () => {
    // a ready match that shares a player with an on-court match
    const clash = await one<{ id: string; court: string }>(`
      select r.id, (select c.id from courts c where c.tournament_id = r.tournament_id and not exists (select 1 from matches x where x.court_id = c.id and x.status = 'on_court') limit 1) as court
      from matches r join entry_players ep on ep.entry_id in (r.entry_a_id, r.entry_b_id)
      join entry_players ep2 on ep2.player_id = ep.player_id
      join matches busy on busy.status = 'on_court' and ep2.entry_id in (busy.entry_a_id, busy.entry_b_id) and busy.tournament_id = r.tournament_id
      where r.status = 'ready' limit 1`);
    expect(clash?.id).toBeTruthy();
    await rejects(
      () => as('scorer', () => db.query(`select call_match($1, $2, true)`, [clash.id, clash.court])),
      /player_busy.*is playing match #/s,
    );
  });

  it('rest time is enforced unless the desk overrides it', async () => {
    // A ready match whose players are all free; make one of them have just finished another match.
    const r = await one<{ id: string; tournament_id: string; player_id: string }>(`
      select m.id, m.tournament_id, ep.player_id from matches m
      join entry_players ep on ep.entry_id = m.entry_a_id
      where m.status = 'ready' and not exists (
        select 1 from entry_players x join entry_players y on y.player_id = x.player_id
        join matches busy on busy.status = 'on_court' and y.entry_id in (busy.entry_a_id, busy.entry_b_id)
        where x.entry_id in (m.entry_a_id, m.entry_b_id))
      limit 1`);
    expect(r?.id).toBeTruthy();
    const prev = await one<{ id: string }>(
      `select m.id from matches m join entry_players ep on ep.entry_id in (m.entry_a_id, m.entry_b_id)
      where ep.player_id = $1 and m.status = 'finished' and m.result <> 'walkover' limit 1`,
      [r.player_id],
    );
    expect(prev?.id).toBeTruthy();
    await db.query(
      `update matches set finished_at = now() - interval '5 minutes', started_at = now() - interval '30 minutes', called_at = now() - interval '33 minutes' where id = $1`,
      [prev.id],
    );
    const court = await one<{ id: string }>(
      `select c.id from courts c where c.tournament_id = $1 and not exists (select 1 from matches x where x.court_id = c.id and x.status = 'on_court') limit 1`,
      [r.tournament_id],
    );
    expect(court?.id).toBeTruthy();
    await rejects(() => as('scorer', () => db.query(`select call_match($1, $2)`, [r.id, court.id])), /player_resting.*finished 5 min ago/s);
    await as('scorer', () => db.query(`select call_match($1, $2, true)`, [r.id, court.id]));
    expect((await one<{ status: string }>(`select status from matches where id = $1`, [r.id])).status).toBe('on_court');
    expect(
      await count(`select count(*) n from match_log where match_id = $1 and action = 'called' and actor_id = $2`, [r.id, users.scorer]),
    ).toBe(1);
  });

  it('game scores must be possible under the match rules', async () => {
    const m = await one<{ id: string }>(`select id from matches where status = 'on_court' and rules_id = 'BWF_3x21' limit 1`);
    const m30 = await one<{ id: string }>(`select id from matches where status in ('on_court', 'ready') and rules_id = 'ONE_30' limit 1`);
    expect(m?.id && m30?.id).toBeTruthy();
    {
      await rejects(() => db.query(`insert into match_games values ($1, 3, 31, 29)`, [m.id]), /not a possible score/);
      await rejects(() => db.query(`insert into match_games values ($1, 3, 23, 20)`, [m.id]), /not a possible score/);
    }
    {
      await rejects(() => db.query(`insert into match_games values ($1, 2, 10, 5)`, [m30.id]), /beyond best of 1/);
      await rejects(() => db.query(`insert into match_games values ($1, 1, 31, 20)`, [m30.id]), /not a possible score/);
    }
  });

  it('a finished match must agree with its games', async () => {
    const m = await one<{ id: string }>(`select id from matches where status in ('ready','on_court') and rules_id = 'BWF_3x21' limit 1`);
    await rejects(
      () => as('owner', () => db.query(`select record_result($1, 'normal', 'a', '[[21,15]]'::jsonb)`, [m.id])),
      /nobody has won 2 game/,
    );
    await rejects(
      () => as('owner', () => db.query(`select record_result($1, 'normal', 'b', '[[21,15],[21,18]]'::jsonb)`, [m.id])),
      /winner does not match/,
    );
    await rejects(
      () => as('owner', () => db.query(`select record_result($1, 'normal', 'a', '[[21,15],[21,18],[21,3]]'::jsonb)`, [m.id])),
      /after the match was over/,
    );
    await rejects(
      () => as('owner', () => db.query(`select record_result($1, 'retired', 'a', '[[21,15],[21,18]]'::jsonb)`, [m.id])),
      /already decided/,
    );
    // still not finished after the failed attempts
    expect((await one<{ status: string }>(`select status from matches where id = $1`, [m.id])).status).not.toBe('finished');
  });

  it('a one-game-to-30 match finishes with a single 30-x game', async () => {
    const m = await one<{ id: string }>(`select id from matches where status in ('ready','on_court') and rules_id = 'ONE_30' limit 1`);
    await as('scorer', () => db.query(`select record_result($1, 'normal', 'b', '[[24,30]]'::jsonb)`, [m.id]));
    const r = await one<{ status: string; winner_side: string; started_at: string | null }>(
      `select status, winner_side, started_at from matches where id = $1`,
      [m.id],
    );
    expect(r.status).toBe('finished');
    expect(r.winner_side).toBe('b');
  });

  it('entries respect singles / doubles / mixed rules and one entry per player per event', async () => {
    const ms = await one<{ id: string }>(`select id from events where kind = 'MS' and tournament_id = $1`, [uuid('t-winter')]);
    const xd = await one<{ id: string }>(`select id from events where kind = 'XD' and tournament_id = $1`, [uuid('t-winter')]);
    const woman = await one<{ id: string }>(`select id from players where gender = 'female' limit 1`);
    const men = (
      await db.query<{ id: string }>(
        `select id from players where gender = 'male' and id not in (select player_id from entry_players where event_id = $1) limit 2`,
        [ms.id],
      )
    ).rows;
    const insertEntry = (eventId: string, players: string[]) =>
      db.transaction(async (tx) => {
        const e = randomUUID();
        await tx.query(`insert into entries (id, event_id) values ($1,$2)`, [e, eventId]);
        for (const p of players)
          await tx.query(`insert into entry_players (entry_id, event_id, player_id) values ($1,$2,$3)`, [e, eventId, p]);
      });
    await rejects(() => insertEntry(ms.id, [woman.id]), /Men's events are for male players/);
    await rejects(() => insertEntry(ms.id, [men[0].id, men[1].id]), /singles entry needs exactly 1 player/);
    await rejects(() => insertEntry(xd.id, [men[0].id, men[1].id]), /one man and one woman/);
    const already = await one<{ player_id: string }>(`select player_id from entry_players where event_id = $1 limit 1`, [ms.id]);
    await rejects(() => insertEntry(ms.id, [already.player_id]), /duplicate key|entry_players_event_id_player_id_key/);
    await insertEntry(ms.id, [men[0].id]); // a valid one still works
  });

  it('a doubles entry can wait on a partner named at registration, with levels per event', async () => {
    const xd = await one<{ id: string }>(`select id from events where kind = 'XD' and tournament_id = $1`, [uuid('t-winter')]);
    const woman = await one<{ id: string }>(
      `select id from players where gender = 'female' and id not in (select player_id from entry_players where event_id = $1) limit 1`,
      [xd.id],
    );
    const entry = (withInvite: boolean, inviteEmail: string | null = 'sam@example.com') =>
      db.transaction(async (tx) => {
        const e = randomUUID();
        await tx.query(`insert into entries (id, event_id) values ($1,$2)`, [e, xd.id]);
        await tx.query(`insert into entry_players (entry_id, event_id, player_id, skill_level) values ($1,$2,$3,'B')`, [
          e,
          xd.id,
          woman.id,
        ]);
        if (withInvite)
          await tx.query(`insert into partner_invites (entry_id, name, email, skill_level) values ($1, 'Sam Ortiz', $2, 'C')`, [
            e,
            inviteEmail,
          ]);
        return e;
      });
    // one player, no partner named and not looking: rejected
    await rejects(() => entry(false), /needs 2 players, or 1 while looking for or waiting on a partner/);
    // a bad email on the invite is rejected
    await rejects(() => entry(true, 'not-an-email'), /check/);
    // named partner (email optional) is fine, and the level for this event is stored
    const e = await entry(true, null);
    expect(await count(`select count(*) n from partner_invites where entry_id = $1 and skill_level = 'C' and email is null`, [e])).toBe(1);
    expect(await count(`select count(*) n from entry_players where entry_id = $1 and skill_level = 'B'`, [e])).toBe(1);
  });

  it('seeds and match numbers are unique', async () => {
    const e = (
      await db.query<{ id: string; event_id: string }>(`select id, event_id from entries where status = 'accepted' and seed = 1 limit 1`)
    ).rows[0];
    const other = await one<{ id: string }>(`select id from entries where event_id = $1 and status = 'accepted' and seed is null limit 1`, [
      e.event_id,
    ]);
    await rejects(() => db.query(`update entries set seed = 1 where id = $1`, [other.id]), /entries_seed_unique|duplicate key/);
    const m = (
      await db.query<{ tournament_id: string; number: number }>(
        `select tournament_id, number from matches where number is not null limit 2`,
      )
    ).rows;
    await rejects(
      () =>
        db.query(`update matches set number = $1 where tournament_id = $2 and number = $3`, [m[0].number, m[1].tournament_id, m[1].number]),
      /duplicate key/,
    );
  });

  it('draw structure: sources are well-formed and a result feeds only one slot', async () => {
    const m = await one<{ match_id: string; from_match_id: string }>(
      `select match_id, from_match_id from match_sources where kind = 'winner' limit 1`,
    );
    await rejects(
      () =>
        db.query(`insert into match_sources (match_id, side, kind, entry_id, from_match_id) values ($1, 'a', 'winner', $2, $3)`, [
          randomUUID(),
          randomUUID(),
          m.from_match_id,
        ]),
      /check|violates/,
    );
    // Re-point another slot at the same winner: one result can only feed one slot.
    const other = await one<{ match_id: string; side: string }>(
      `select match_id, side from match_sources where kind = 'winner' and from_match_id <> $1 limit 1`,
      [m.from_match_id],
    );
    expect(other?.match_id).toBeTruthy();
    await rejects(
      () =>
        db.transaction(async (tx) => {
          await tx.query(`delete from match_sources where match_id = $1 and side = $2`, [other.match_id, other.side]);
          await tx.query(`insert into match_sources (match_id, side, kind, from_match_id) values ($1, $2, 'winner', $3)`, [
            other.match_id,
            other.side,
            m.from_match_id,
          ]);
        }),
      /duplicate key|feed_unique/,
    );
    await rejects(
      () =>
        db.query(
          `insert into tournaments (organization_id, slug, name, start_date, end_date) select organization_id, 'Bad Slug!', 'x x x', '2027-01-01', '2026-12-31' from tournaments limit 1`,
        ),
      /check/,
    );
  });

  it('every match change is logged with who made it', async () => {
    const n = await count(`select count(*) n from match_log where action = 'result' and actor_id = $1`, [users.scorer]);
    expect(n).toBeGreaterThan(0);
  });
});

describe('row level security', () => {
  it('the public sees published tournaments and live scores, never drafts or private details', async () => {
    await as('anon', async () => {
      expect(await count(`select count(*) n from tournaments`)).toBe(demo.tournaments.length);
      expect(await count(`select count(*) n from tournaments where slug = 'secret-draft'`)).toBe(0);
      expect(await count(`select count(*) n from matches`)).toBe(demo.matches.length);
      expect(await count(`select count(*) n from match_games`)).toBeGreaterThan(0);
      expect(await count(`select count(*) n from player_private`)).toBe(0);
      expect(await count(`select count(*) n from registrations`)).toBe(0);
      expect(await count(`select count(*) n from match_log`)).toBe(0);
      expect(await count(`select count(*) n from entries where status = 'pending'`)).toBe(0);
      // the public has no write access at all
      await rejects(() => db.query(`update matches set live_a = 5, live_b = 5 where status = 'on_court'`), /permission denied/);
      await rejects(
        () =>
          db.query(`insert into notices (tournament_id, kind, audience, title) values ($1, 'announcement', 'all', 'spam')`, [
            uuid('t-fall'),
          ]),
        /permission denied/,
      );
    });
  });

  it('a signed-in stranger cannot change anything', async () => {
    await as('outsider', async () => {
      const upd = await db.query(`update matches set live_a = 1, live_b = 0 where status = 'on_court'`);
      expect(upd.affectedRows ?? 0).toBe(0);
      expect((await db.query(`update events set fee_cents = 0`)).affectedRows ?? 0).toBe(0);
      await rejects(
        () => db.query(`insert into events (tournament_id, kind, name) values ($1, 'MS', 'Hack')`, [uuid('t-fall')]),
        /row-level security/,
      );
      expect(await count(`select count(*) n from tournaments where slug = 'secret-draft'`)).toBe(0);
    });
  });

  it('a scorer runs courts and scores but cannot edit events', async () => {
    await as('scorer', async () => {
      expect((await db.query(`update matches set live_a = 3, live_b = 2 where status = 'on_court'`)).affectedRows).toBeGreaterThan(0);
      expect((await db.query(`update events set fee_cents = 0`)).affectedRows ?? 0).toBe(0);
      expect(await count(`select count(*) n from tournaments where slug = 'secret-draft'`)).toBe(1);
      expect(await count(`select count(*) n from match_log`)).toBeGreaterThan(0);
    });
  });

  it('an admin manages events and sees private player details', async () => {
    await as('owner', async () => {
      expect(
        (await db.query(`update events set fee_cents = fee_cents where tournament_id = $1`, [uuid('t-fall')])).affectedRows,
      ).toBeGreaterThan(0);
      expect(await count(`select count(*) n from player_private`)).toBeGreaterThan(0);
    });
  });

  it('saved draw changes are for draw staff only: admins save them, scorers and the public never see them', async () => {
    const ev = await db.query<{ id: string }>(
      `select e.id from events e join tournaments t on t.id = e.tournament_id where t.id = $1 limit 1`,
      [uuid('t-fall')],
    );
    const eventId = ev.rows[0].id;
    await as('owner', async () => {
      await db.query(`insert into draw_drafts (event_id, base, seating) values ($1, '{}', '{"m1:a": null}')`, [eventId]);
      const saved = await db.query<{ saved_by: string }>(`select saved_by from draw_drafts where event_id = $1`, [eventId]);
      expect(saved.rows[0].saved_by).toBe(users.owner);
    });
    await as('scorer', async () => {
      expect(await count(`select count(*) n from draw_drafts`)).toBe(0);
      await expect(db.query(`insert into draw_drafts (event_id, base, seating) values ($1, '{}', '{}')`, [eventId])).rejects.toThrow();
    });
    await as('anon', async () => {
      expect(await count(`select count(*) n from draw_drafts`)).toBe(0);
    });
  });

  it('match-day staff check players in; players, strangers and the public never see check-ins', async () => {
    const player = await one<{ id: string }>(
      `select distinct ep.player_id id from entry_players ep join entries e on e.id = ep.entry_id join events ev on ev.id = e.event_id where ev.tournament_id = $1 limit 1`,
      [uuid('t-fall')],
    );
    await as('scorer', async () => {
      await db.query(`insert into check_ins (tournament_id, player_id) values ($1, $2)`, [uuid('t-fall'), player.id]);
      const row = await one<{ checked_in_by: string }>(`select checked_in_by from check_ins where player_id = $1`, [player.id]);
      expect(row.checked_in_by).toBe(users.scorer);
      // one check-in per player per tournament
      await rejects(
        () => db.query(`insert into check_ins (tournament_id, player_id) values ($1, $2)`, [uuid('t-fall'), player.id]),
        /duplicate key/,
      );
    });
    for (const who of ['player', 'outsider'] as const) {
      await as(who, async () => {
        expect(await count(`select count(*) n from check_ins`), who).toBe(0);
        expect((await db.query(`delete from check_ins`)).affectedRows ?? 0, who).toBe(0);
      });
    }
    await as('anon', async () => {
      expect(await count(`select count(*) n from check_ins`)).toBe(0);
      await rejects(() => db.query(`delete from check_ins`), /permission denied/);
    });
    await as('owner', async () => {
      expect((await db.query(`delete from check_ins where tournament_id = $1`, [uuid('t-fall')])).affectedRows).toBe(1);
    });
  });

  it('a player sees their own private details and their own notifications only', async () => {
    await as('player', async () => {
      expect(await count(`select count(*) n from player_private`)).toBe(1);
      const visible = (await db.query<{ audience: string }>(`select audience from notices`)).rows;
      const callsForMe = demo.notices.filter((n) => n.audience === 'players' && n.playerIds?.includes('p-M5')).length;
      const forAll = demo.notices.filter((n) => n.audience === 'all').length;
      expect(visible.length).toBe(callsForMe + forAll);
      // can follow players and save preferences
      await db.query(`insert into follows (player_id) values ($1)`, [uuid('p-F1')]);
      await db.query(`insert into notification_prefs (sms) values (false)`);
      expect(await count(`select count(*) n from follows`)).toBe(1);
    });
  });
});

describe('accounts', () => {
  /** Create an auth user (profile is made by trigger) and run fn as them. */
  async function signUp(email: string, verified: boolean) {
    const id = randomUUID();
    await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3, $4)`, [
      id,
      email,
      verified ? new Date().toISOString() : null,
      { name: 'Google Name' },
    ]);
    return id;
  }
  async function asId<T>(id: string, fn: () => Promise<T>): Promise<T> {
    await db.exec(`select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    }
  }

  it('new accounts get a profile named from Google or the email', async () => {
    const id = await signUp('jo.park@example.com', true);
    expect((await one<{ display_name: string }>(`select display_name from profiles where id = $1`, [id])).display_name).toBe('Google Name');
  });

  it('only owners invite staff; the invite turns into a membership once the email is verified', async () => {
    const org = (await one<{ id: string }>(`select id from organizations limit 1`)).id;
    await rejects(
      () =>
        as('scorer', () =>
          db.query(`insert into organization_invites (organization_id, email, role) values ($1, 'x@example.com', 'admin')`, [org]),
        ),
      /row-level security/,
    );
    await as('owner', () =>
      db.query(`insert into organization_invites (organization_id, email, role) values ($1, 'New.Coach@example.com', 'admin')`, [org]),
    );
    const coach = await signUp('new.coach@example.com', false);
    // unverified email: nothing happens
    expect((await asId(coach, () => one<{ n: number }>(`select public.accept_my_invites() n`))).n).toBe(0);
    await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [coach]);
    expect((await asId(coach, () => one<{ n: number }>(`select public.accept_my_invites() n`))).n).toBe(1);
    expect(await count(`select count(*) n from organization_members where user_id = $1 and role = 'admin'`, [coach])).toBe(1);
    // idempotent
    expect((await asId(coach, () => one<{ n: number }>(`select public.accept_my_invites() n`))).n).toBe(0);
    // the new admin can now manage the org's tournaments
    await asId(coach, async () => {
      expect(
        (await db.query(`update events set fee_cents = fee_cents where tournament_id = $1`, [uuid('t-fall')])).affectedRows,
      ).toBeGreaterThan(0);
    });
  });

  it('a new account claims the player record registered with its verified email', async () => {
    const id = await signUp('p-f3@example.com', true);
    expect((await asId(id, () => one<{ id: string }>(`select public.claim_my_player() id`))).id).toBe(uuid('p-F3'));
    expect((await one<{ profile_id: string }>(`select profile_id from players where id = $1`, [uuid('p-F3')])).profile_id).toBe(id);
    // claiming again returns the same player; private details are now visible to the account
    await asId(id, async () => {
      expect((await one<{ id: string }>(`select public.claim_my_player() id`)).id).toBe(uuid('p-F3'));
      expect(await count(`select count(*) n from player_private`)).toBe(1);
    });
    // an unverified email cannot claim anyone
    const sneaky = await signUp('p-f4@example.com', false);
    expect((await asId(sneaky, () => one<{ id: string | null }>(`select public.claim_my_player() id`))).id).toBeNull();
  });
});
