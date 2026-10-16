-- Drop flight "by results": two placement rounds sort everyone into flights A–D, then each flight is a knockout.
alter type public.drop_variant add value if not exists 'PLACEMENT';

-- Where a "by results" draw puts its byes: placement round 1 (top of the seeding order), placement round 2
-- (the best of each round-2 group), or inside the flights (their Round 1).
create type public.placement_byes as enum ('round1', 'round2', 'flights');
alter table public.events add column placement_byes public.placement_byes not null default 'round1';
