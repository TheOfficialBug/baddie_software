-- Live app data: every record of the app's data snapshot (src/data/types.ts `DB`) is one row here,
-- keyed by collection + id and stored as the app's own JSON. The organizer desk writes the rows it
-- changes; every open page receives them through Supabase Realtime (or catches up by `version`).
--
-- Staff (organization_members) write directly under row level security. Players never write here
-- directly: they register through `app_submit`, which only accepts their own player record and new,
-- pending entries in tournaments that are open for registration.
--
-- Contact details (player email) are kept out of the public rows, in `app_private`.

create sequence public.app_version_seq;

create table public.app_entities (
  coll       text not null check (coll in (
               'tournaments', 'players', 'events', 'entries', 'stages', 'groups', 'matches',
               'registrations', 'notices', 'updates', 'drawDrafts', 'checkIns')),
  id         text not null check (char_length(id) between 1 and 200),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 262144),
  deleted    boolean not null default false,
  -- global change counter: clients catch up with "version > last seen"
  version    bigint not null default nextval('public.app_version_seq'),
  -- the browser tab that wrote the row (so it can ignore its own echo)
  client_id  text check (client_id is null or char_length(client_id) <= 64),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (coll, id)
);
create index app_entities_version_idx on public.app_entities (version);

create table public.app_private (
  id         text primary key check (char_length(id) between 1 and 200), -- player id
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 8192),
  user_id    uuid,
  version    bigint not null default nextval('public.app_version_seq'),
  updated_at timestamptz not null default now()
);
create index app_private_email_idx on public.app_private (lower(data ->> 'email'));

create or replace function public.app_touch() returns trigger
language plpgsql as $$
begin
  new.version := nextval('public.app_version_seq');
  new.updated_at := now();
  if tg_table_name = 'app_entities' then
    new.created_at := old.created_at;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;
create trigger app_entities_touch before update on public.app_entities for each row execute function public.app_touch();
create trigger app_private_touch before update on public.app_private for each row execute function public.app_touch();

-- The caller's strongest staff role in any organization (this site runs one organizer's tournaments).
create or replace function public.app_role() returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from public.organization_members where user_id = auth.uid()
  order by case role when 'owner' then 0 when 'admin' then 1 else 2 end
  limit 1
$$;

-- Collections a scorer may change on match day.
create or replace function public.app_can_write(p_coll text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.app_role()
    when 'owner' then true
    when 'admin' then true
    when 'scorer' then p_coll in ('matches', 'updates', 'notices', 'checkIns')
    else false
  end
$$;

alter table public.app_entities enable row level security;
alter table public.app_private enable row level security;

-- Draws, results and the schedule are public; undo history, unpublished draw edits and check-ins are staff only.
create policy "app read" on public.app_entities for select
  using (coll not in ('updates', 'drawDrafts', 'checkIns') or public.app_role() is not null);
create policy "app insert by staff" on public.app_entities for insert to authenticated
  with check (public.app_can_write(coll));
create policy "app update by staff" on public.app_entities for update to authenticated
  using (public.app_can_write(coll)) with check (public.app_can_write(coll));
-- no delete policy: records are retired with deleted = true so every client sees the removal

create policy "private read" on public.app_private for select to authenticated
  using (user_id = auth.uid() or public.app_role() in ('owner', 'admin', 'scorer'));
create policy "private insert by admins" on public.app_private for insert to authenticated
  with check (public.app_role() in ('owner', 'admin'));
create policy "private update by admins" on public.app_private for update to authenticated
  using (public.app_role() in ('owner', 'admin')) with check (public.app_role() in ('owner', 'admin'));

revoke all on public.app_entities, public.app_private from anon, authenticated;
grant select on public.app_entities to anon, authenticated;
grant insert, update on public.app_entities to authenticated;
grant select, insert, update on public.app_private to authenticated;
grant usage on sequence public.app_version_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Player self-service: register for a tournament
-- ---------------------------------------------------------------------------
-- p_rows: [{coll, id, data}] in the order players → private → entries → registrations.
create or replace function public.app_submit(p_rows jsonb, p_client text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  r      jsonb;
  c      text;
  rid    text;
  d      jsonb;
  cur    public.app_entities;
  ev     jsonb;
  tour   jsonb;
  pid    text;
  rows_n int := 0;
begin
  if me is null then raise exception 'not_signed_in' using detail = 'Sign in to register.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 40 then
    raise exception 'bad_request' using detail = 'Too many changes at once.';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    c := r ->> 'coll';
    rid := r ->> 'id';
    d := r -> 'data';
    if rid is null or d is null or jsonb_typeof(d) <> 'object' or d ->> 'id' is distinct from rid then
      raise exception 'bad_request' using detail = 'Malformed record.';
    end if;
    rows_n := rows_n + 1;

    if c = 'private' then
      -- contact details of my own player record
      if not exists (select 1 from public.app_entities
                     where coll = 'players' and id = rid and not deleted and data ->> 'userId' = me::text) then
        raise exception 'not_allowed' using detail = 'You can only change your own details.';
      end if;
      insert into public.app_private (id, data, user_id) values (rid, d - 'id', me)
      on conflict (id) do update set data = excluded.data, user_id = me
      where public.app_private.user_id is null or public.app_private.user_id = me;
      continue;
    end if;

    select * into cur from public.app_entities where coll = c and id = rid;

    if c = 'players' then
      if d ->> 'userId' is distinct from me::text then
        raise exception 'not_allowed' using detail = 'A player record must belong to your account.';
      end if;
      if found and cur.data ->> 'userId' is distinct from me::text then
        raise exception 'not_allowed' using detail = 'That player record belongs to someone else.';
      end if;
      -- the organizer's rating and contact details never come from the player
      d := d - 'strength' - 'email';
      if found and cur.data ? 'strength' then d := d || jsonb_build_object('strength', cur.data -> 'strength'); end if;

    elsif c = 'entries' then
      if found then raise exception 'not_allowed' using detail = 'That entry already exists.'; end if;
      pid := d -> 'playerIds' ->> 0;
      if not exists (select 1 from public.app_entities
                     where coll = 'players' and id = pid and not deleted and data ->> 'userId' = me::text) then
        raise exception 'not_allowed' using detail = 'You can only enter yourself.';
      end if;
      select data into ev from public.app_entities where coll = 'events' and id = d ->> 'eventId' and not deleted;
      if ev is null then raise exception 'not_found' using detail = 'That event no longer exists.'; end if;
      select data into tour from public.app_entities where coll = 'tournaments' and id = ev ->> 'tournamentId' and not deleted;
      if tour is null or tour ->> 'status' <> 'registration'
         or (coalesce(tour ->> 'regCloses', '') <> '' and current_date > (tour ->> 'regCloses')::date) then
        raise exception 'registration_closed' using detail = 'Registration for this tournament is closed.';
      end if;
      if exists (select 1 from public.app_entities e
                 where e.coll = 'entries' and not e.deleted and e.data ->> 'eventId' = d ->> 'eventId'
                   and e.data ->> 'status' <> 'withdrawn' and e.data -> 'playerIds' ? pid) then
        raise exception 'already_entered' using detail = 'You are already entered in that event.';
      end if;
      d := jsonb_set(d - 'seed', '{status}', '"pending"');

    elsif c = 'registrations' then
      if found then raise exception 'not_allowed' using detail = 'That registration already exists.'; end if;
      if not exists (select 1 from public.app_entities
                     where coll = 'players' and id = d ->> 'playerId' and not deleted and data ->> 'userId' = me::text) then
        raise exception 'not_allowed' using detail = 'You can only register yourself.';
      end if;
      select data into tour from public.app_entities where coll = 'tournaments' and id = d ->> 'tournamentId' and not deleted;
      if tour is null or tour ->> 'status' <> 'registration'
         or (coalesce(tour ->> 'regCloses', '') <> '' and current_date > (tour ->> 'regCloses')::date) then
        raise exception 'registration_closed' using detail = 'Registration for this tournament is closed.';
      end if;

    else
      raise exception 'not_allowed' using detail = 'Only the organizers can change that.';
    end if;

    insert into public.app_entities (coll, id, data, client_id, updated_by)
    values (c, rid, d, left(p_client, 64), me)
    on conflict (coll, id) do update set data = excluded.data, deleted = false, client_id = excluded.client_id;
  end loop;
end $$;

-- Link my account to the player record that has my verified email (e.g. one the organizer imported).
-- Returns my player id, or null.
create or replace function public.app_claim_player() returns text
language plpgsql security definer set search_path = public as $$
declare em text := public.my_verified_email(); pid text;
begin
  if auth.uid() is null then return null; end if;
  select id into pid from public.app_entities
  where coll = 'players' and not deleted and data ->> 'userId' = auth.uid()::text
  order by created_at limit 1;
  if found then return pid; end if;
  if em is null then return null; end if;
  select e.id into pid from public.app_entities e join public.app_private p on p.id = e.id
  where e.coll = 'players' and not e.deleted and coalesce(e.data ->> 'userId', '') = '' and lower(p.data ->> 'email') = em
  order by e.created_at desc limit 1;
  if pid is null then return null; end if;
  update public.app_entities set data = data || jsonb_build_object('userId', auth.uid()::text)
  where coll = 'players' and id = pid;
  update public.app_private set user_id = auth.uid() where id = pid;
  return pid;
end $$;

revoke all on function public.app_submit(jsonb, text) from public, anon;
revoke all on function public.app_claim_player() from public, anon;
grant execute on function public.app_submit(jsonb, text) to authenticated;
grant execute on function public.app_claim_player() to authenticated;

-- ---------------------------------------------------------------------------
-- Team screen: staff see each other's names and emails
-- ---------------------------------------------------------------------------
create or replace function public.org_team(p_org uuid)
returns table (user_id uuid, role public.member_role, name text, email text)
language sql stable security definer set search_path = public, auth as $$
  select m.user_id, m.role, p.display_name, u.email
  from public.organization_members m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_org and public.org_role(p_org) is not null
  order by m.created_at
$$;
revoke all on function public.org_team(uuid) from public, anon;
grant execute on function public.org_team(uuid) to authenticated;

-- Members can change roles and remove people only through these, so an organization always keeps an owner.
create or replace function public.org_set_role(p_org uuid, p_user uuid, p_role public.member_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.org_role(p_org) is distinct from 'owner' then raise exception 'not_allowed' using detail = 'Only owners manage the team.'; end if;
  if p_role <> 'owner' and (select role from public.organization_members where organization_id = p_org and user_id = p_user) = 'owner'
     and (select count(*) from public.organization_members where organization_id = p_org and role = 'owner') = 1 then
    raise exception 'last_owner' using detail = 'Make someone else an owner first.';
  end if;
  update public.organization_members set role = p_role where organization_id = p_org and user_id = p_user;
end $$;

create or replace function public.org_remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.org_role(p_org) is distinct from 'owner' then raise exception 'not_allowed' using detail = 'Only owners manage the team.'; end if;
  if (select role from public.organization_members where organization_id = p_org and user_id = p_user) = 'owner'
     and (select count(*) from public.organization_members where organization_id = p_org and role = 'owner') = 1 then
    raise exception 'last_owner' using detail = 'The last owner can''t be removed.';
  end if;
  delete from public.organization_members where organization_id = p_org and user_id = p_user;
end $$;
revoke all on function public.org_set_role(uuid, uuid, public.member_role) from public, anon;
revoke all on function public.org_remove_member(uuid, uuid) from public, anon;
grant execute on function public.org_set_role(uuid, uuid, public.member_role) to authenticated;
grant execute on function public.org_remove_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The organizer: one organization, owned by whoever signs in with this verified email
-- ---------------------------------------------------------------------------
insert into public.organizations (name, slug, created_by) values ('Smashboard', 'smashboard', null)
on conflict (slug) do nothing;
insert into public.organization_invites (organization_id, email, role, invited_by)
select id, 'kunals@iastate.edu', 'owner', null from public.organizations where slug = 'smashboard'
on conflict do nothing;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.app_entities;
  end if;
end $$;
