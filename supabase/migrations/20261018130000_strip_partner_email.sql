-- A doubles partner named at registration (entries.pendingPartner) may carry an email. Entries are public and
-- nothing reads that email, so the database drops it on every write, whoever writes it.
create or replace function public.app_scrub_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted then
    new.data := jsonb_build_object('id', new.id);
    if new.coll = 'players' then delete from public.app_private where id = new.id; end if;
  elsif new.coll = 'entries' and new.data -> 'pendingPartner' ? 'email' then
    new.data := new.data #- '{pendingPartner,email}';
  end if;
  return new;
end $$;
revoke execute on function public.app_scrub_deleted() from public, anon, authenticated;

update public.app_entities set data = data #- '{pendingPartner,email}'
where coll = 'entries' and data -> 'pendingPartner' ? 'email';
