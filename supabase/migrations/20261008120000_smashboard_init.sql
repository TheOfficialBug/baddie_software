-- =============================================================================
-- Smashboard: badminton tournament platform — initial schema
--
-- Design notes (full write-up in supabase/SCHEMA.md):
--  * Postgres enforces the invariants that must never break, even if a client is buggy:
--      one match per court, a player on one court at a time, game scores within the
--      scoring rules, finished matches consistent with their games, singles/doubles/mixed
--      entry composition, one entry per player per event, unique seeds and match numbers.
--  * Draw logic (seeding, pairing, progression) stays in the TypeScript engine; the database
--    stores its output (stages, pools, matches and the sources that feed each slot).
--  * Row level security: the public can read published tournaments; organization members
--    run them (owner/admin manage everything, scorer handles courts and scores); players
--    see their own private details and registrations.
--  * Every change to a match is written to match_log by a trigger (audit + undo).
--  * Targets Supabase (Postgres 15+). Uses auth.users / auth.uid() from Supabase Auth.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.tournament_status as enum ('draft', 'registration', 'live', 'completed', 'archived');
create type public.event_kind as enum ('MS', 'WS', 'MD', 'WD', 'XD');
create type public.draw_mode as enum ('round_robin', 'drop_flight', 'knockout');
create type public.drop_variant as enum ('AB', 'ABCD');
create type public.pairing_mode as enum ('balanced', 'classic', 'random');
create type public.draw_state as enum ('none', 'published');
create type public.entry_status as enum ('pending', 'accepted', 'waitlisted', 'withdrawn');
create type public.stage_kind as enum ('group', 'knockout');
create type public.flight as enum ('A', 'B', 'C', 'D');
create type public.match_status as enum ('pending', 'ready', 'on_court', 'finished', 'bye');
create type public.match_result as enum ('normal', 'retired', 'walkover', 'dq');
create type public.match_side as enum ('a', 'b');
create type public.slot_source as enum ('entry', 'bye', 'winner', 'loser', 'pool_rank');
create type public.gender as enum ('male', 'female');
create type public.skill_level as enum ('A', 'B', 'C', 'D');
create type public.member_role as enum ('owner', 'admin', 'scorer');
create type public.notice_kind as enum ('call', 'announcement', 'delay', 'draw', 'result');
create type public.notice_audience as enum ('all', 'event', 'players');
create type public.notice_channel as enum ('app', 'sms', 'email');
create type public.payment_status as enum ('unpaid', 'paid', 'refunded', 'waived');
create type public.invite_status as enum ('sent', 'accepted', 'declined', 'expired');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Scoring rules (reference data)
-- ---------------------------------------------------------------------------
create table public.scoring_rules (
  id            text primary key check (id ~ '^[A-Za-z0-9_]{2,32}$'),
  label         text not null,
  short_label   text not null,
  best_of       smallint not null check (best_of in (1, 3, 5)),
  points_to_win smallint not null check (points_to_win between 5 and 50),
  cap           smallint not null,
  interval_at   smallint,
  note          text not null default '',
  check (cap between points_to_win and points_to_win + 15)
);

insert into public.scoring_rules (id, label, short_label, best_of, points_to_win, cap, interval_at, note) values
  ('BWF_3x21', 'Best of 3 games to 21', '3×21', 3, 21, 30, 11, 'Best of 3 games to 21. At 20-all a 2-point lead wins; at 29-all the 30th point wins.'),
  ('BWF_3x15', 'Best of 3 games to 15', '3×15', 3, 15, 21, 8, 'Best of 3 games to 15. At 14-all a 2-point lead wins; at 20-all the 21st point wins.'),
  ('ONE_21',   '1 game to 21', '1×21', 1, 21, 30, 11, 'One game to 21 with BWF deuce and a cap at 30.'),
  ('ONE_15',   '1 game to 15', '1×15', 1, 15, 21, 8, 'One game to 15 with deuce from 14-all and a cap at 21.'),
  ('ONE_30',   '1 game to 30', '1×30', 1, 30, 30, 15, 'One game, first to 30 points wins.'),
  ('ONE_31',   '1 game to 31', '1×31', 1, 31, 31, 16, 'One game to 31, first to 31 wins.'),
  ('ONE_11',   '1 game to 11', '1×11', 1, 11, 15, 6, 'One game to 11 with deuce from 10-all and a cap at 15.');

-- 'complete' | 'in_progress' | 'invalid' for a game score under given rules.
-- Mirrors checkGame() in src/engine/rules.ts.
create or replace function public.game_state(a int, b int, p int, c int) returns text
language plpgsql immutable as $$
declare
  hi int := greatest(a, b);
  lo int := least(a, b);
  d  int := greatest(a, b) - least(a, b);
begin
  if a < 0 or b < 0 or hi > c then return 'invalid'; end if;
  if c = p then
    if hi = p and lo < p then return 'complete'; end if;
    if hi = p and lo = p then return 'invalid'; end if;
    return 'in_progress';
  end if;
  if hi < p then return 'in_progress'; end if;
  if hi = p then return case when lo <= p - 2 then 'complete' else 'in_progress' end; end if;
  if hi = c then return case when d in (1, 2) then 'complete' else 'invalid' end; end if;
  if d = 2 then return 'complete'; end if;
  if d <= 1 then return 'in_progress'; end if;
  return 'invalid';
end $$;

-- ---------------------------------------------------------------------------
-- People and organizations
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  avatar_url   text check (avatar_url is null or avatar_url ~ '^https://'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- A profile row for every new Supabase Auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1)), 80))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Who runs tournaments (a club, a league, a school).
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 2 and 120),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated before update on public.organizations for each row execute function public.set_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            public.member_role not null default 'scorer',
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- The creator of an organization becomes its owner.
create or replace function public.add_org_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.organization_members (organization_id, user_id, role)
    values (new.id, new.created_by, 'owner') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger organizations_owner after insert on public.organizations for each row execute function public.add_org_owner();

-- Playing clubs (affiliation, used to keep clubmates apart in draws). Not the same as organizations.
create table public.clubs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 2 and 120),
  city       text,
  created_at timestamptz not null default now()
);
create unique index clubs_name_unique on public.clubs (lower(btrim(name)));

-- Players: public identity (name, club, level). Private details live in player_private.
create table public.players (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid unique references public.profiles (id) on delete set null,
  full_name   text not null check (char_length(btrim(full_name)) between 2 and 80),
  gender      public.gender not null,
  club_id     uuid references public.clubs (id) on delete set null,
  skill_level public.skill_level not null default 'C',
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index players_club_idx on public.players (club_id);
create index players_name_idx on public.players (lower(full_name));
create trigger players_updated before update on public.players for each row execute function public.set_updated_at();

create table public.player_private (
  player_id  uuid primary key references public.players (id) on delete cascade,
  email      text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone      text check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$'),
  birth_year smallint check (birth_year is null or birth_year between 1900 and 2100),
  updated_at timestamptz not null default now()
);
create trigger player_private_updated before update on public.player_private for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tournaments, courts, events
-- ---------------------------------------------------------------------------
create table public.tournaments (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  slug                   text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name                   text not null check (char_length(btrim(name)) between 3 and 120),
  venue                  text not null default '' check (char_length(venue) <= 160),
  city                   text not null default '' check (char_length(city) <= 120),
  timezone               text not null default 'America/Chicago',
  start_date             date not null,
  end_date               date not null,
  status                 public.tournament_status not null default 'draft',
  registration_closes_at timestamptz,
  rules_id               text not null default 'BWF_3x21' references public.scoring_rules (id),
  first_round_rules_id   text references public.scoring_rules (id),
  rest_minutes           smallint not null default 20 check (rest_minutes between 0 and 180),
  next_match_number      integer not null default 1 check (next_match_number >= 1),
  currency               char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  about                  text check (about is null or char_length(about) <= 4000),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 14)
);
create index tournaments_org_idx on public.tournaments (organization_id);
create index tournaments_public_idx on public.tournaments (status, start_date);
create trigger tournaments_updated before update on public.tournaments for each row execute function public.set_updated_at();

create table public.courts (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order    smallint not null default 0,
  is_active     boolean not null default true,
  unique (tournament_id, name)
);
create index courts_tournament_idx on public.courts (tournament_id, sort_order);

create table public.events (
  id                   uuid primary key default gen_random_uuid(),
  tournament_id        uuid not null references public.tournaments (id) on delete cascade,
  kind                 public.event_kind not null,
  name                 text not null check (char_length(btrim(name)) between 2 and 80),
  min_age              smallint check (min_age between 30 and 90),
  max_age              smallint check (max_age between 9 and 21),
  fee_cents            integer not null default 0 check (fee_cents between 0 and 1000000),
  entry_cap            smallint not null default 32 check (entry_cap between 2 and 256),
  rules_id             text not null default 'BWF_3x21' references public.scoring_rules (id),
  first_round_rules_id text references public.scoring_rules (id),
  mode                 public.draw_mode not null default 'knockout',
  group_size           smallint not null default 4 check (group_size between 3 and 8),
  advance              smallint not null default 2 check (advance between 0 and 2),
  drop_variant         public.drop_variant not null default 'ABCD',
  third_place          boolean not null default false,
  plate                boolean not null default false,
  seed_count           smallint not null default 0 check (seed_count between 0 and 32),
  pairing              public.pairing_mode not null default 'balanced',
  draw_state           public.draw_state not null default 'none',
  draw_seed            bigint,
  published_at         timestamptz,
  sort_order           smallint not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (tournament_id, name),
  check (min_age is null or max_age is null),
  check ((draw_state = 'published') = (published_at is not null))
);
create index events_tournament_idx on public.events (tournament_id, sort_order);
create trigger events_updated before update on public.events for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Registration and entries
-- ---------------------------------------------------------------------------
create table public.registrations (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  player_id      uuid not null references public.players (id) on delete cascade,
  submitted_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  total_cents    integer not null default 0 check (total_cents >= 0),
  payment_status public.payment_status not null default 'unpaid',
  payment_ref    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tournament_id, player_id)
);
create index registrations_player_idx on public.registrations (player_id);
create trigger registrations_updated before update on public.registrations for each row execute function public.set_updated_at();

create table public.entries (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.events (id) on delete cascade,
  status              public.entry_status not null default 'pending',
  seed                smallint check (seed between 1 and 64),
  registration_id     uuid references public.registrations (id) on delete set null,
  looking_for_partner boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, event_id)
);
create index entries_event_idx on public.entries (event_id, status);
create unique index entries_seed_unique on public.entries (event_id, seed) where seed is not null and status = 'accepted';
create trigger entries_updated before update on public.entries for each row execute function public.set_updated_at();

-- event_id is repeated here (and tied to the entry by a composite key) so that
-- "one entry per player per event" can be a plain unique constraint.
create table public.entry_players (
  entry_id  uuid not null,
  event_id  uuid not null,
  player_id uuid not null references public.players (id) on delete restrict,
  -- level the player gave for this event (singles and doubles can differ); null = the player's general level
  skill_level public.skill_level,
  primary key (entry_id, player_id),
  unique (event_id, player_id),
  foreign key (entry_id, event_id) references public.entries (id, event_id) on delete cascade
);
create index entry_players_player_idx on public.entry_players (player_id);

-- Singles: 1 player. Doubles: 2 (or 1 while looking for a partner). MS/MD men, WS/WD women, XD one of each.
create or replace function public.check_entry_composition() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  row_  jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  eid   uuid;
  k     public.event_kind;
  lfp   boolean;
  n     int;
  men   int;
  women int;
begin
  eid := (row_ ->> case when tg_table_name = 'entries' then 'id' else 'entry_id' end)::uuid;
  select ev.kind, en.looking_for_partner into k, lfp
  from public.entries en join public.events ev on ev.id = en.event_id
  where en.id = eid;
  if not found then return null; end if; -- entry deleted

  select count(*), count(*) filter (where p.gender = 'male'), count(*) filter (where p.gender = 'female')
  into n, men, women
  from public.entry_players ep join public.players p on p.id = ep.player_id
  where ep.entry_id = eid;

  if k in ('MS', 'WS') and n <> 1 then
    raise exception 'A singles entry needs exactly 1 player (entry % has %)', eid, n using errcode = 'check_violation';
  end if;
  if k in ('MD', 'WD', 'XD') and not (
    n = 2 or (n = 1 and (lfp or exists (select 1 from public.partner_invites pi where pi.entry_id = eid and pi.status = 'sent')))
  ) then
    raise exception 'A doubles entry needs 2 players, or 1 while looking for or waiting on a partner (entry % has %)', eid, n using errcode = 'check_violation';
  end if;
  if k in ('MS', 'MD') and women > 0 then
    raise exception 'Men''s events are for male players (entry %)', eid using errcode = 'check_violation';
  end if;
  if k in ('WS', 'WD') and men > 0 then
    raise exception 'Women''s events are for female players (entry %)', eid using errcode = 'check_violation';
  end if;
  if k = 'XD' and n = 2 and (men <> 1 or women <> 1) then
    raise exception 'A mixed doubles pair is one man and one woman (entry %)', eid using errcode = 'check_violation';
  end if;
  return null;
end $$;
create constraint trigger entries_composition after insert or update on public.entries
  deferrable initially deferred for each row execute function public.check_entry_composition();
create constraint trigger entry_players_composition after insert or update or delete on public.entry_players
  deferrable initially deferred for each row execute function public.check_entry_composition();

-- A doubles partner named at registration who isn't registered yet (one per entry).
-- They confirm through the emailed link, or the organizer links them when they register.
create table public.partner_invites (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null unique references public.entries (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  skill_level public.skill_level not null,
  token       uuid not null unique default gen_random_uuid(),
  status      public.invite_status not null default 'sent',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days'
);

-- ---------------------------------------------------------------------------
-- Draws: stages, pools, matches
-- ---------------------------------------------------------------------------
create table public.stages (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  kind       public.stage_kind not null,
  name       text not null check (char_length(name) between 1 and 40),
  flight     public.flight,
  sort_order smallint not null check (sort_order >= 0),
  size       smallint not null check (size >= 0 and (size & (size - 1)) = 0),
  rounds     smallint not null check (rounds between 0 and 8),
  unique (event_id, sort_order),
  check ((kind = 'group') = (size = 0)),
  check (kind = 'group' or size = (1 << rounds) or (name = '3rd place' and size = 2 and rounds = 1))
);

create table public.pools (
  id         uuid primary key default gen_random_uuid(),
  stage_id   uuid not null references public.stages (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  sort_order smallint not null default 0,
  unique (stage_id, name)
);

create table public.pool_members (
  pool_id  uuid not null references public.pools (id) on delete cascade,
  entry_id uuid not null references public.entries (id) on delete cascade,
  position smallint not null check (position >= 0),
  primary key (pool_id, entry_id),
  unique (pool_id, position)
);

create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  event_id      uuid not null references public.events (id) on delete cascade,
  stage_id      uuid not null references public.stages (id) on delete cascade,
  pool_id       uuid references public.pools (id) on delete cascade,
  number        integer check (number >= 1),                 -- null for byes
  round         smallint not null check (round between 1 and 16),
  position      smallint not null check (position >= 0),
  rules_id      text not null references public.scoring_rules (id),  -- scoring for this match (round 1 may differ)
  entry_a_id    uuid references public.entries (id) on delete set null,
  entry_b_id    uuid references public.entries (id) on delete set null,
  status        public.match_status not null default 'pending',
  court_id      uuid references public.courts (id) on delete set null,
  called_at     timestamptz,
  started_at    timestamptz,
  finished_at   timestamptz,
  live_a        smallint check (live_a between 0 and 60),
  live_b        smallint check (live_b between 0 and 60),
  result        public.match_result,
  winner_side   public.match_side,
  loser_to      text,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tournament_id, number),
  check (entry_a_id is null or entry_b_id is null or entry_a_id <> entry_b_id),
  check ((live_a is null) = (live_b is null)),
  check (status not in ('ready', 'on_court', 'finished') or (entry_a_id is not null and entry_b_id is not null)),
  check (status <> 'on_court' or (court_id is not null and called_at is not null)),
  check (status <> 'finished' or (winner_side is not null and result is not null and finished_at is not null)),
  check (status in ('finished', 'bye') or (winner_side is null and result is null)),
  check (status = 'finished' or finished_at is null),
  check (status not in ('ready', 'on_court', 'finished') or number is not null),
  check (started_at is null or called_at is null or started_at >= called_at),
  check (finished_at is null or started_at is null or finished_at >= started_at)
);
create unique index matches_bracket_slot on public.matches (stage_id, round, position) where pool_id is null;
create unique index matches_pool_slot on public.matches (pool_id, position) where pool_id is not null;
-- A court holds one match at a time.
create unique index matches_one_per_court on public.matches (court_id) where status = 'on_court';
create index matches_tournament_status_idx on public.matches (tournament_id, status);
create index matches_event_idx on public.matches (event_id, stage_id, round);
create index matches_entries_idx on public.matches (entry_a_id, entry_b_id);
create trigger matches_updated before update on public.matches for each row execute function public.set_updated_at();

-- Where each side of a match comes from (structure of the draw).
create table public.match_sources (
  match_id      uuid not null references public.matches (id) on delete cascade,
  side          public.match_side not null,
  kind          public.slot_source not null,
  entry_id      uuid references public.entries (id) on delete cascade,
  from_match_id uuid references public.matches (id) on delete cascade,
  pool_id       uuid references public.pools (id) on delete cascade,
  pool_rank     smallint check (pool_rank between 1 and 8),
  primary key (match_id, side),
  check (from_match_id is null or from_match_id <> match_id),
  check (case kind
    when 'entry' then entry_id is not null and from_match_id is null and pool_id is null and pool_rank is null
    when 'bye' then entry_id is null and from_match_id is null and pool_id is null and pool_rank is null
    when 'winner' then from_match_id is not null and entry_id is null and pool_id is null and pool_rank is null
    when 'loser' then from_match_id is not null and entry_id is null and pool_id is null and pool_rank is null
    when 'pool_rank' then pool_id is not null and pool_rank is not null and entry_id is null and from_match_id is null
  end)
);
-- A match's winner (or loser) can only go to one place.
create unique index match_sources_feed_unique on public.match_sources (from_match_id, kind) where kind in ('winner', 'loser');
create unique index match_sources_pool_rank_unique on public.match_sources (pool_id, pool_rank) where kind = 'pool_rank';

create table public.match_games (
  match_id uuid not null references public.matches (id) on delete cascade,
  game_no  smallint not null check (game_no between 1 and 5),
  points_a smallint not null check (points_a between 0 and 60),
  points_b smallint not null check (points_b between 0 and 60),
  primary key (match_id, game_no)
);

-- Each game must be possible under the match's scoring rules (e.g. no 31-29 in 3×21).
create or replace function public.check_game_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.scoring_rules;
begin
  select sr.* into r from public.matches m join public.scoring_rules sr on sr.id = m.rules_id where m.id = new.match_id;
  if new.game_no > r.best_of then
    raise exception 'Game % is beyond best of % (% scoring)', new.game_no, r.best_of, r.id using errcode = 'check_violation';
  end if;
  if public.game_state(new.points_a, new.points_b, r.points_to_win, r.cap) = 'invalid' then
    raise exception '%-% is not a possible score under % (%)', new.points_a, new.points_b, r.id, r.note using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger match_games_valid before insert or update on public.match_games for each row execute function public.check_game_score();

-- A finished match must agree with its games. Checked at commit, so games and status can be
-- written together in one transaction (see record_result).
create or replace function public.validate_finished_match(p_match uuid) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  r         public.scoring_rules;
  g         record;
  need      int;
  wa        int := 0;
  wb        int := 0;
  expect_no int := 1;
  decided   boolean := false;
  partial   boolean := false;
  st        text;
  cur       public.matches;
begin
  select * into cur from public.matches where id = p_match;
  if not found or cur.status <> 'finished' then return; end if;
  select * into r from public.scoring_rules where id = cur.rules_id;
  need := (r.best_of + 1) / 2;

  for g in select * from public.match_games where match_id = cur.id order by game_no loop
    if g.game_no <> expect_no then
      raise exception 'Match %: games must be numbered 1..n without gaps', cur.number using errcode = 'check_violation';
    end if;
    expect_no := expect_no + 1;
    if decided or partial then
      raise exception 'Match %: game % was entered after the match was over', cur.number, g.game_no using errcode = 'check_violation';
    end if;
    st := public.game_state(g.points_a, g.points_b, r.points_to_win, r.cap);
    if st <> 'complete' then
      if cur.result in ('retired', 'dq') then partial := true; continue; end if;
      raise exception 'Match %: game % (%-%) is not finished', cur.number, g.game_no, g.points_a, g.points_b using errcode = 'check_violation';
    end if;
    if g.points_a > g.points_b then wa := wa + 1; else wb := wb + 1; end if;
    if wa = need or wb = need then decided := true; end if;
  end loop;

  if cur.result = 'normal' then
    if not decided then
      raise exception 'Match % is marked finished but nobody has won % game(s)', cur.number, need using errcode = 'check_violation';
    end if;
    if (wa > wb) <> (cur.winner_side = 'a') then
      raise exception 'Match %: the winner does not match the game scores', cur.number using errcode = 'check_violation';
    end if;
  elsif cur.result = 'retired' and decided then
    raise exception 'Match % was already decided, so it cannot end in a retirement', cur.number using errcode = 'check_violation';
  end if;
end $fn$;

create or replace function public.check_match_result() returns trigger
language plpgsql as $$
begin
  perform public.validate_finished_match(new.id);
  return null;
end $$;

create or replace function public.check_match_result_from_game() returns trigger
language plpgsql as $$
begin
  perform public.validate_finished_match((to_jsonb(case when tg_op = 'DELETE' then old else new end) ->> 'match_id')::uuid);
  return null;
end $$;

create constraint trigger matches_result_consistent after insert or update on public.matches
  deferrable initially deferred for each row execute function public.check_match_result();
create constraint trigger match_games_result_consistent after insert or update or delete on public.match_games
  deferrable initially deferred for each row execute function public.check_match_result_from_game();

-- A player can only be on one court at a time.
create or replace function public.check_player_free() returns trigger
language plpgsql security definer set search_path = public as $$
declare clash record;
begin
  if new.status <> 'on_court' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'on_court' and old.entry_a_id is not distinct from new.entry_a_id and old.entry_b_id is not distinct from new.entry_b_id then
    return new;
  end if;
  select p.full_name, m2.number, c.name as court into clash
  from public.entry_players mine
  join public.entry_players theirs on theirs.player_id = mine.player_id
  join public.matches m2 on m2.status = 'on_court' and m2.id <> new.id and m2.tournament_id = new.tournament_id
                        and theirs.entry_id in (m2.entry_a_id, m2.entry_b_id)
  join public.players p on p.id = mine.player_id
  left join public.courts c on c.id = m2.court_id
  where mine.entry_id in (new.entry_a_id, new.entry_b_id)
  limit 1;
  if found then
    raise exception 'player_busy' using errcode = 'P0001',
      detail = format('%s is playing match #%s on %s', clash.full_name, clash.number, coalesce(clash.court, 'another court'));
  end if;
  return new;
end $$;
create trigger matches_player_free before insert or update of status, entry_a_id, entry_b_id on public.matches
  for each row execute function public.check_player_free();

-- ---------------------------------------------------------------------------
-- Audit log (every meaningful match change) — powers history and undo
-- ---------------------------------------------------------------------------
create table public.match_log (
  id            bigint generated always as identity primary key,
  match_id      uuid not null references public.matches (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  actor_id      uuid references public.profiles (id) on delete set null,
  action        text not null check (action in ('called', 'returned', 'started', 'live', 'result', 'edited', 'reset')),
  before        jsonb,
  after         jsonb,
  created_at    timestamptz not null default now()
);
create index match_log_match_idx on public.match_log (match_id, created_at desc);
create index match_log_tournament_idx on public.match_log (tournament_id, created_at desc);

create or replace function public.log_match_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare act text;
begin
  act := case
    when old.status <> 'on_court' and new.status = 'on_court' then 'called'
    when old.status = 'on_court' and new.status = 'ready' then 'returned'
    when old.status <> 'finished' and new.status = 'finished' then 'result'
    when old.status = 'finished' and new.status = 'finished' and (old.winner_side, old.result) is distinct from (new.winner_side, new.result) then 'edited'
    when old.status = 'finished' and new.status <> 'finished' then 'reset'
    when old.started_at is null and new.started_at is not null then 'started'
    when (old.live_a, old.live_b) is distinct from (new.live_a, new.live_b) then 'live'
    else null
  end;
  if act is not null then
    insert into public.match_log (match_id, tournament_id, actor_id, action, before, after)
    values (new.id, new.tournament_id, auth.uid(), act,
      jsonb_build_object('status', old.status, 'court_id', old.court_id, 'called_at', old.called_at, 'started_at', old.started_at,
        'finished_at', old.finished_at, 'live', jsonb_build_array(old.live_a, old.live_b), 'result', old.result, 'winner_side', old.winner_side),
      jsonb_build_object('status', new.status, 'court_id', new.court_id, 'called_at', new.called_at, 'started_at', new.started_at,
        'finished_at', new.finished_at, 'live', jsonb_build_array(new.live_a, new.live_b), 'result', new.result, 'winner_side', new.winner_side));
  end if;
  return null;
end $$;
create trigger matches_log after update on public.matches for each row execute function public.log_match_change();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notices (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  kind          public.notice_kind not null,
  audience      public.notice_audience not null,
  event_id      uuid references public.events (id) on delete cascade,
  match_id      uuid references public.matches (id) on delete set null,
  title         text not null check (char_length(btrim(title)) between 2 and 120),
  body          text check (body is null or char_length(body) <= 1000),
  channels      public.notice_channel[] not null default '{app}' check (cardinality(channels) between 1 and 3),
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  check ((audience = 'event') = (event_id is not null))
);
create index notices_tournament_idx on public.notices (tournament_id, created_at desc);

create table public.notice_recipients (
  notice_id uuid not null references public.notices (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (notice_id, player_id)
);
create index notice_recipients_player_idx on public.notice_recipients (player_id);

create table public.notice_reads (
  notice_id uuid not null references public.notices (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  read_at   timestamptz not null default now(),
  primary key (notice_id, user_id)
);

create table public.notification_prefs (
  user_id       uuid primary key references public.profiles (id) on delete cascade default auth.uid(),
  court_calls   boolean not null default true,
  draw_out      boolean not null default true,
  heads_up      boolean not null default false,  -- "2 matches before mine"
  sms           boolean not null default true,
  email         boolean not null default true,
  updated_at    timestamptz not null default now()
);

create table public.follows (
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  player_id  uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, player_id)
);

-- ---------------------------------------------------------------------------
-- Access helpers (security definer: they read membership without recursing into RLS)
-- ---------------------------------------------------------------------------
create or replace function public.org_role(p_org uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from public.organization_members where organization_id = p_org and user_id = auth.uid()
$$;

create or replace function public.tournament_role(p_tournament uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select om.role from public.tournaments t
  join public.organization_members om on om.organization_id = t.organization_id and om.user_id = auth.uid()
  where t.id = p_tournament
$$;

create or replace function public.can_manage(p_tournament uuid) returns boolean
language sql stable as $$ select coalesce(public.tournament_role(p_tournament) in ('owner', 'admin'), false) $$;

create or replace function public.can_score(p_tournament uuid) returns boolean
language sql stable as $$ select public.tournament_role(p_tournament) is not null $$;

create or replace function public.is_visible(p_tournament uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournaments where id = p_tournament and status <> 'draft')
      or public.tournament_role(p_tournament) is not null
$$;

create or replace function public.event_tournament(p_event uuid) returns uuid
language sql stable security definer set search_path = public as $$ select tournament_id from public.events where id = p_event $$;

create or replace function public.stage_tournament(p_stage uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select e.tournament_id from public.stages s join public.events e on e.id = s.event_id where s.id = p_stage
$$;

create or replace function public.match_tournament(p_match uuid) returns uuid
language sql stable security definer set search_path = public as $$ select tournament_id from public.matches where id = p_match $$;

create or replace function public.notice_tournament(p_notice uuid) returns uuid
language sql stable security definer set search_path = public as $$ select tournament_id from public.notices where id = p_notice $$;

create or replace function public.is_notice_recipient(p_notice uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.notice_recipients nr
                 join public.players p on p.id = nr.player_id
                 where nr.notice_id = p_notice and (p.profile_id = auth.uid() or p.created_by = auth.uid()))
$$;

create or replace function public.my_player_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.players where profile_id = auth.uid() or created_by = auth.uid()
$$;

-- Does the current user manage any tournament this player has entered?
create or replace function public.manages_player(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entry_players ep join public.events e on e.id = ep.event_id
    where ep.player_id = p_player and public.can_manage(e.tournament_id))
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.scoring_rules       enable row level security;
alter table public.profiles            enable row level security;
alter table public.organizations       enable row level security;
alter table public.organization_members enable row level security;
alter table public.clubs               enable row level security;
alter table public.players             enable row level security;
alter table public.player_private      enable row level security;
alter table public.tournaments         enable row level security;
alter table public.courts              enable row level security;
alter table public.events              enable row level security;
alter table public.registrations       enable row level security;
alter table public.entries             enable row level security;
alter table public.entry_players       enable row level security;
alter table public.partner_invites     enable row level security;
alter table public.stages              enable row level security;
alter table public.pools               enable row level security;
alter table public.pool_members        enable row level security;
alter table public.matches             enable row level security;
alter table public.match_sources       enable row level security;
alter table public.match_games         enable row level security;
alter table public.match_log           enable row level security;
alter table public.notices             enable row level security;
alter table public.notice_recipients   enable row level security;
alter table public.notice_reads        enable row level security;
alter table public.notification_prefs  enable row level security;
alter table public.follows             enable row level security;

-- reference data
create policy "rules readable" on public.scoring_rules for select using (true);

-- profiles: your own
create policy "own profile read" on public.profiles for select using (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- organizations
create policy "org read by members" on public.organizations for select using (public.org_role(id) is not null);
create policy "org create" on public.organizations for insert to authenticated with check (created_by = auth.uid());
create policy "org update by owner/admin" on public.organizations for update using (public.org_role(id) in ('owner', 'admin'));
create policy "org delete by owner" on public.organizations for delete using (public.org_role(id) = 'owner');

create policy "members read by members" on public.organization_members for select using (public.org_role(organization_id) is not null);
create policy "members managed by owner" on public.organization_members for all
  using (public.org_role(organization_id) = 'owner') with check (public.org_role(organization_id) = 'owner');

-- clubs and players: public identity
create policy "clubs readable" on public.clubs for select using (true);
create policy "clubs create" on public.clubs for insert to authenticated with check (true);

create policy "players readable" on public.players for select using (true);
create policy "players create" on public.players for insert to authenticated with check (created_by = auth.uid());
create policy "players update" on public.players for update
  using (profile_id = auth.uid() or created_by = auth.uid() or public.manages_player(id));

create policy "private read" on public.player_private for select
  using (player_id in (select public.my_player_ids()) or public.manages_player(player_id));
create policy "private write" on public.player_private for insert to authenticated
  with check (player_id in (select public.my_player_ids()));
create policy "private update" on public.player_private for update
  using (player_id in (select public.my_player_ids()) or public.manages_player(player_id));

-- tournaments and their structure: public once out of draft; members can always see
create policy "tournaments readable" on public.tournaments for select using (status <> 'draft' or public.tournament_role(id) is not null);
create policy "tournaments create" on public.tournaments for insert to authenticated
  with check (public.org_role(organization_id) in ('owner', 'admin'));
create policy "tournaments update" on public.tournaments for update using (public.can_manage(id)) with check (public.can_manage(id));
create policy "tournaments delete" on public.tournaments for delete using (public.tournament_role(id) = 'owner');

create policy "courts readable" on public.courts for select using (public.is_visible(tournament_id));
create policy "courts managed" on public.courts for all using (public.can_manage(tournament_id)) with check (public.can_manage(tournament_id));

create policy "events readable" on public.events for select using (public.is_visible(tournament_id));
create policy "events managed" on public.events for all using (public.can_manage(tournament_id)) with check (public.can_manage(tournament_id));

-- registrations: the player who registered, or the organizers
create policy "registrations read" on public.registrations for select
  using (player_id in (select public.my_player_ids()) or public.can_manage(tournament_id));
create policy "registrations create" on public.registrations for insert to authenticated
  with check (player_id in (select public.my_player_ids()) and public.is_visible(tournament_id));
create policy "registrations managed" on public.registrations for update using (public.can_manage(tournament_id));

-- entries: accepted entries are public; players see their own; organizers see all
create policy "entries read" on public.entries for select using (
  (status = 'accepted' and public.is_visible(public.event_tournament(event_id)))
  or public.can_manage(public.event_tournament(event_id))
  or exists (select 1 from public.entry_players ep where ep.entry_id = entries.id and ep.player_id in (select public.my_player_ids())));
create policy "entries self-register" on public.entries for insert to authenticated
  with check (status = 'pending' and seed is null and public.is_visible(public.event_tournament(event_id)));
create policy "entries managed" on public.entries for all
  using (public.can_manage(public.event_tournament(event_id))) with check (public.can_manage(public.event_tournament(event_id)));

create policy "entry players read" on public.entry_players for select using (public.is_visible(public.event_tournament(event_id)));
create policy "entry players self" on public.entry_players for insert to authenticated
  with check (player_id in (select public.my_player_ids())
    and exists (select 1 from public.entries e where e.id = entry_id and e.status = 'pending'));
create policy "entry players managed" on public.entry_players for all
  using (public.can_manage(public.event_tournament(event_id))) with check (public.can_manage(public.event_tournament(event_id)));

create policy "invites read" on public.partner_invites for select using (
  exists (select 1 from public.entry_players ep where ep.entry_id = partner_invites.entry_id and ep.player_id in (select public.my_player_ids()))
  or public.can_manage(public.event_tournament((select event_id from public.entries where id = partner_invites.entry_id))));
create policy "invites create" on public.partner_invites for insert to authenticated with check (
  exists (select 1 from public.entry_players ep where ep.entry_id = partner_invites.entry_id and ep.player_id in (select public.my_player_ids())));

-- draws
create policy "stages readable" on public.stages for select using (public.is_visible(public.event_tournament(event_id)));
create policy "stages managed" on public.stages for all
  using (public.can_manage(public.event_tournament(event_id))) with check (public.can_manage(public.event_tournament(event_id)));
create policy "pools readable" on public.pools for select using (public.is_visible(public.stage_tournament(stage_id)));
create policy "pools managed" on public.pools for all
  using (public.can_manage(public.stage_tournament(stage_id))) with check (public.can_manage(public.stage_tournament(stage_id)));
create policy "pool members readable" on public.pool_members for select
  using (public.is_visible(public.stage_tournament((select stage_id from public.pools where id = pool_id))));
create policy "pool members managed" on public.pool_members for all
  using (public.can_manage(public.stage_tournament((select stage_id from public.pools where id = pool_id))))
  with check (public.can_manage(public.stage_tournament((select stage_id from public.pools where id = pool_id))));

-- matches: everyone reads live scores; scorers update; managers create/delete (draws)
create policy "matches readable" on public.matches for select using (public.is_visible(tournament_id));
create policy "matches scored" on public.matches for update using (public.can_score(tournament_id)) with check (public.can_score(tournament_id));
create policy "matches created" on public.matches for insert with check (public.can_manage(tournament_id));
create policy "matches deleted" on public.matches for delete using (public.can_manage(tournament_id));

create policy "sources readable" on public.match_sources for select using (public.is_visible(public.match_tournament(match_id)));
create policy "sources managed" on public.match_sources for all
  using (public.can_manage(public.match_tournament(match_id))) with check (public.can_manage(public.match_tournament(match_id)));

create policy "games readable" on public.match_games for select using (public.is_visible(public.match_tournament(match_id)));
create policy "games scored" on public.match_games for all
  using (public.can_score(public.match_tournament(match_id))) with check (public.can_score(public.match_tournament(match_id)));

create policy "log read by staff" on public.match_log for select using (public.can_score(tournament_id));

-- notifications
create policy "notices read" on public.notices for select using (
  public.can_score(tournament_id)
  or (public.is_visible(tournament_id) and (
       audience = 'all'
    or (audience = 'event' and exists (select 1 from public.entry_players ep where ep.event_id = notices.event_id and ep.player_id in (select public.my_player_ids())))
    or (audience = 'players' and public.is_notice_recipient(id)))));
create policy "notices send" on public.notices for insert with check (public.can_score(tournament_id));
create policy "recipients read" on public.notice_recipients for select
  using (player_id in (select public.my_player_ids()) or public.can_score(public.notice_tournament(notice_id)));
create policy "recipients write" on public.notice_recipients for insert
  with check (public.can_score(public.notice_tournament(notice_id)));

create policy "own reads" on public.notice_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own prefs" on public.notification_prefs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own follows" on public.follows for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPCs: atomic match-day actions (run with the caller's rights, so RLS applies)
-- ---------------------------------------------------------------------------

-- Send a match to a court. Raises 'player_busy' (from the trigger) if someone is already playing,
-- and 'player_resting' unless p_ignore_rest is true.
create or replace function public.call_match(p_match uuid, p_court uuid, p_ignore_rest boolean default false)
returns public.matches language plpgsql as $$
declare m public.matches; rest int; recent record;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'match_not_found'; end if;
  if m.status <> 'ready' then raise exception 'match_not_ready' using detail = format('Match #%s is %s', m.number, m.status); end if;
  if not exists (select 1 from public.courts where id = p_court and tournament_id = m.tournament_id and is_active) then
    raise exception 'court_not_found';
  end if;
  if not p_ignore_rest then
    select t.rest_minutes into rest from public.tournaments t where t.id = m.tournament_id;
    select p.full_name, max(m2.finished_at) as last into recent
    from public.entry_players ep
    join public.entry_players ep2 on ep2.player_id = ep.player_id
    join public.matches m2 on m2.status = 'finished' and m2.result <> 'walkover' and ep2.entry_id in (m2.entry_a_id, m2.entry_b_id)
    join public.players p on p.id = ep.player_id
    where ep.entry_id in (m.entry_a_id, m.entry_b_id)
    group by p.full_name
    having max(m2.finished_at) > now() - make_interval(mins => rest)
    order by max(m2.finished_at) desc limit 1;
    if found then
      raise exception 'player_resting' using detail = format('%s finished %s min ago', recent.full_name, floor(extract(epoch from now() - recent.last) / 60));
    end if;
  end if;
  update public.matches set status = 'on_court', court_id = p_court, called_at = now(), live_a = null, live_b = null, version = version + 1
  where id = p_match returning * into m;
  return m;
end $$;

-- Save a result: games + outcome in one transaction (the deferred checks validate the lot).
create or replace function public.record_result(p_match uuid, p_result public.match_result, p_winner public.match_side, p_games jsonb, p_expected_version int default null)
returns public.matches language plpgsql as $$
declare m public.matches; g jsonb; i int := 0;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'match_not_found'; end if;
  if p_expected_version is not null and m.version <> p_expected_version then
    raise exception 'stale_match' using detail = 'Someone else changed this match. Reload and try again.';
  end if;
  if m.status not in ('ready', 'on_court', 'finished') then raise exception 'match_not_ready'; end if;
  delete from public.match_games where match_id = p_match;
  for g in select * from jsonb_array_elements(coalesce(p_games, '[]'::jsonb)) loop
    i := i + 1;
    insert into public.match_games (match_id, game_no, points_a, points_b) values (p_match, i, (g ->> 0)::int, (g ->> 1)::int);
  end loop;
  update public.matches set
    status = 'finished', result = p_result, winner_side = p_winner, live_a = null, live_b = null,
    started_at = coalesce(started_at, called_at),
    finished_at = coalesce(finished_at, now()),
    version = version + 1
  where id = p_match returning * into m;
  return m;
end $$;

-- Hand out consecutive match numbers when a draw is published.
create or replace function public.reserve_match_numbers(p_tournament uuid, p_count int) returns int
language plpgsql as $$
declare first_no int;
begin
  if not public.can_manage(p_tournament) then raise exception 'not_allowed'; end if;
  update public.tournaments set next_match_number = next_match_number + p_count where id = p_tournament
  returning next_match_number - p_count into first_no;
  return first_no;
end $$;

-- ---------------------------------------------------------------------------
-- Accounts: staff invites and linking a new account to its player record
-- ---------------------------------------------------------------------------

-- An owner invites someone by email; they become a member when they sign in with that (verified) email.
create table public.organization_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email           text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role            public.member_role not null default 'scorer',
  invited_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  accepted_by     uuid references public.profiles (id) on delete set null
);
create unique index organization_invites_pending on public.organization_invites (organization_id, lower(email)) where accepted_at is null;
alter table public.organization_invites enable row level security;
create policy "invites visible to org admins" on public.organization_invites for select
  using (public.org_role(organization_id) in ('owner', 'admin'));
create policy "invites sent by owner" on public.organization_invites for insert to authenticated
  with check (public.org_role(organization_id) = 'owner');
create policy "invites withdrawn by owner" on public.organization_invites for delete
  using (public.org_role(organization_id) = 'owner' and accepted_at is null);

-- The signed-in user's email, only once it is verified (password sign-ups confirm by email; Google is verified).
create or replace function public.my_verified_email() returns text
language sql stable security definer set search_path = public, auth as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null
$$;

-- Turn pending invites for my verified email into memberships. Returns how many were accepted.
create or replace function public.accept_my_invites() returns int
language plpgsql security definer set search_path = public as $$
declare em text := public.my_verified_email(); n int;
begin
  if auth.uid() is null or em is null then return 0; end if;
  insert into public.organization_members (organization_id, user_id, role)
  select organization_id, auth.uid(), role from public.organization_invites
  where lower(email) = em and accepted_at is null
  on conflict (organization_id, user_id) do nothing;
  update public.organization_invites set accepted_at = now(), accepted_by = auth.uid()
  where lower(email) = em and accepted_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Link my account to the player record registered with my verified email (if not linked yet).
create or replace function public.claim_my_player() returns uuid
language plpgsql security definer set search_path = public as $$
declare em text := public.my_verified_email(); pid uuid;
begin
  if auth.uid() is null then return null; end if;
  select id into pid from public.players where profile_id = auth.uid();
  if found then return pid; end if;
  if em is null then return null; end if;
  select p.id into pid from public.players p join public.player_private pp on pp.player_id = p.id
  where lower(pp.email) = em and p.profile_id is null
  order by p.created_at desc limit 1;
  if pid is not null then update public.players set profile_id = auth.uid() where id = pid; end if;
  return pid;
end $$;

-- ---------------------------------------------------------------------------
-- Grants (Supabase roles) and realtime
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;
revoke insert, update, delete on public.scoring_rules from authenticated;
revoke insert, update, delete on public.match_log from authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.matches, public.match_games, public.courts, public.notices;
  end if;
end $$;
