-- Check-in: players who have arrived at the venue, ticked off by the desk at the start of the day.
-- One row per player per tournament; clearing the rows starts check-in again for a new day.
-- Match-day staff (owners, admins, scorers) read and write them; players and the public never see them.

create table public.check_ins (
  tournament_id   uuid not null references public.tournaments (id) on delete cascade,
  player_id       uuid not null references public.players (id) on delete cascade,
  checked_in_at   timestamptz not null default now(),
  checked_in_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  primary key (tournament_id, player_id)
);

alter table public.check_ins enable row level security;

create policy "check-ins run by match-day staff" on public.check_ins for all
  using (public.can_score(tournament_id))
  with check (public.can_score(tournament_id));

-- same grants as every other table; row level security decides which rows anyone sees
grant select on public.check_ins to anon, authenticated;
grant insert, update, delete on public.check_ins to authenticated;
