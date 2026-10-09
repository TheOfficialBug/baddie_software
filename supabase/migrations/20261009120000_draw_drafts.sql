-- Saved, unpublished edits to a published draw ("Save changes" in the draw editor).
-- One per event. Cleared when the changes are published or discarded, or the draw is reset.
-- Only staff who can make draws read or write them: players never see unpublished changes.

create table public.draw_drafts (
  event_id uuid primary key references public.events (id) on delete cascade,
  -- the published starting places this draft was made from; a redone draw makes the draft stale
  base     text not null check (char_length(base) <= 200000),
  -- place key → entry id, or null for an empty place (a bye if left empty)
  seating  jsonb not null check (jsonb_typeof(seating) = 'object'),
  saved_by uuid default auth.uid() references public.profiles (id) on delete set null,
  saved_at timestamptz not null default now()
);

alter table public.draw_drafts enable row level security;

create policy "draw drafts managed" on public.draw_drafts for all
  using (public.can_manage(public.event_tournament(event_id)))
  with check (public.can_manage(public.event_tournament(event_id)));

-- same grants as every other table; row level security decides which rows anyone sees
grant select on public.draw_drafts to anon, authenticated;
grant insert, update, delete on public.draw_drafts to authenticated;
