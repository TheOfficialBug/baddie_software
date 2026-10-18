-- Security hardening (audit of 2026-10-18).
--
--  * Privilege escalation: any signed-in user could insert an organization, become its owner through the
--    add_org_owner trigger, and app_role() (strongest role in ANY organization) then gave them full write
--    access to every tournament and read access to player emails. Organizations are no longer created
--    through the API; staff join only by an owner's invite.
--  * The browser roles held TRUNCATE / TRIGGER / REFERENCES on every table (TRUNCATE ignores RLS). Each
--    role now holds only what the app uses. The normalized schema (20261008120000) is not used by the app
--    yet, so the API roles get no access to it until it is wired up.
--  * Functions: EXECUTE only on the RPCs the app calls and the helpers its policies need; every function
--    has a fixed search_path.
--  * Soft-deleted rows stayed publicly readable with their full data (names, birth years). A deleted row
--    now keeps only its id, which is all clients need to drop it.
--  * Registrations (who entered what, fees owed) are staff only; the app never reads them on public pages.

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- public pages and realtime
grant select on public.app_entities to anon, authenticated;
-- staff (RLS decides who may write what)
grant insert, update on public.app_entities to authenticated;
grant select, insert, update on public.app_private to authenticated;
grant usage on sequence public.app_version_seq to authenticated;
-- accounts and the team screen
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select on public.organizations, public.organization_members to authenticated;
grant select, delete on public.organization_invites to authenticated;
grant insert (organization_id, email, role) on public.organization_invites to authenticated;
grant select on public.waitlist to authenticated;

drop policy if exists "org create" on public.organizations;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  -- functions without a pinned search_path
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') loop
    execute format('alter function %s set search_path = public', f);
  end loop;
end $$;

-- used inside the app_entities / waitlist policies, so every reader needs it (returns null when signed out)
grant execute on function public.app_role() to anon, authenticated;
grant execute on function public.join_waitlist(text, text, text, text, text, text) to anon, authenticated;
grant execute on function
  public.app_can_write(text),
  public.org_role(uuid),
  public.accept_my_invites(),
  public.app_claim_player(),
  public.app_submit(jsonb, text),
  public.org_team(uuid),
  public.org_set_role(uuid, uuid, public.member_role),
  public.org_remove_member(uuid, uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Deleted rows keep nothing but their id; a deleted player's email goes too
-- ---------------------------------------------------------------------------
create or replace function public.app_scrub_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted then
    new.data := jsonb_build_object('id', new.id);
    if new.coll = 'players' then delete from public.app_private where id = new.id; end if;
  end if;
  return new;
end $$;
revoke execute on function public.app_scrub_deleted() from public, anon, authenticated;
create trigger app_entities_scrub before insert or update on public.app_entities
  for each row execute function public.app_scrub_deleted();

update public.app_entities set data = jsonb_build_object('id', id)
where deleted and data <> jsonb_build_object('id', id);
delete from public.app_private p
where not exists (select 1 from public.app_entities e where e.coll = 'players' and e.id = p.id and not e.deleted);

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
drop policy "app read" on public.app_entities;
create policy "app read" on public.app_entities for select
  using (coll not in ('updates', 'drawDrafts', 'checkIns', 'registrations') or (select public.app_role()) is not null);

drop policy "private read" on public.app_private;
create policy "private read" on public.app_private for select to authenticated
  using (user_id = (select auth.uid()) or (select public.app_role()) in ('owner', 'admin', 'scorer'));
