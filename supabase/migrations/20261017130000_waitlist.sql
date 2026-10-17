-- Early-access waitlist: anyone can join (no account), only the organizer's staff can read it.
-- Joining goes through join_waitlist(), which never says whether an email was already on the list.

create table public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  email      text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  role       text not null default 'player' check (role in ('player', 'organizer', 'club')),
  club       text check (club is null or char_length(club) <= 120),
  city       text check (city is null or char_length(city) <= 120),
  source     text check (source is null or char_length(source) <= 120),
  created_at timestamptz not null default now()
);
create unique index waitlist_email_idx on public.waitlist (lower(email));

alter table public.waitlist enable row level security;
create policy "waitlist read by staff" on public.waitlist for select to authenticated
  using (public.app_role() in ('owner', 'admin'));
revoke all on public.waitlist from anon, authenticated;
grant select on public.waitlist to authenticated;

create or replace function public.join_waitlist(
  p_name text, p_email text, p_role text default 'player', p_club text default null, p_city text default null, p_source text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.waitlist (name, email, role, club, city, source)
  values (btrim(p_name), lower(btrim(p_email)), coalesce(nullif(p_role, ''), 'player'),
          nullif(btrim(coalesce(p_club, '')), ''), nullif(btrim(coalesce(p_city, '')), ''), nullif(btrim(coalesce(p_source, '')), ''))
  on conflict (lower(email)) do nothing;
end $$;
revoke all on function public.join_waitlist(text, text, text, text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text, text, text, text) to anon, authenticated;
