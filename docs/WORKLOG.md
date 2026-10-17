# Work log

A running record of work on Smashboard: what changed, why, and anything to follow up.
Newest entries first. Add an entry whenever you finish a piece of work (before committing is a good habit).

Template:

```md
## YYYY-MM-DD — Short title

**What:** what changed, in a sentence or two.
**Why:** the problem or request behind it.
**Files:** the main files touched.
**Checks:** tests / `npm run check` / manual testing done.
**Follow-up:** anything left to do (or "None").
```

---

## 2026-10-16 — Clubs column on brackets (can be switched off)

**What:** Brackets have a **Clubs** button in their controls (next to zoom and Fit). When on, a column left of
round 1 shows each player's club on the same line as their name (doubles: both clubs; no club: blank). Off by
default and remembered on this device, so the bracket stays simple unless you want it. Works on the setup
preview, Move players, published draws and the public pages.
**Why:** Requested: show the club on the left, with a way to hide it so the bracket doesn't get too busy.
**Files:** `src/components/draw/Bracket.tsx`, `src/components/draw/DrawCanvas.tsx`
**Checks:** `npm run check` passes (2128 tests). Headless Chrome: Men's Singles Flight A with Clubs on, clubs line up
with names; no console errors.
**Follow-up:** Not committed yet.

## 2026-10-16 — Move players before publishing

**What:** The draw setup screen has a **Move players** button (knockout and drop flight, including By results).
It shows the first round as tappable places: tap a player, then another player or a bye place, and they swap
(a swap that would leave a line with nobody in it is refused). The preview, flights and warnings are worked out
again from the moved first round, and **Publish draw** publishes it exactly. A banner says the draw uses your
placements, with **Reset placements**; shuffling or changing a setting, the seeds or the seeding order also goes
back to the automatic draw. The moved first round is saved with the unpublished setup on this device.
Round robin groups can't be moved here yet.
**Why:** Requested: move players around by hand before publishing (Edit placements only worked after publishing).
**Files:** `src/features/admin/draws/DrawSetup.tsx`, `src/features/admin/draws/DrawSetup.test.tsx`
**Checks:** `npm run check` passes (2128 tests). Headless Chrome: Men's Singles, swapped a player with a bye,
banner shown, published first round matches the moved one; no console errors.
**Follow-up:** Not committed yet.

## 2026-10-16 — Seed numbers in the draw preview

**What:** The unpublished draw preview on the setup screen now shows seed numbers ([1], [2] …) for the seeded
entries, as the published draw does. Before, seeds were only stored when a draw was published, so events still
in setup (e.g. WS, MD, WD, XD) showed no numbers. How many entries get a number is still the event's Seeds setting.
**Why:** Requested: seed numbers for the other events too (seeded players only).
**Files:** `src/features/admin/draws/DrawSetup.tsx`
**Checks:** `npm run check` passes (2127 tests). Headless Chrome: Mixed Doubles preview shows [1], [4], [5], [8] …
**Follow-up:** Not committed yet.

## 2026-10-16 — Match numbers (score slips) from 1

**What:** Match numbers can start from 1 again. Settings → Reset has a **Renumber matches from 1** row: every match
becomes #1, #2 … with no gaps, each event keeping its block and order (results, courts and draws stay; the
confirmation says to reprint slips). And while nothing in the tournament has been called or played, publishing,
editing or removing a draw renumbers by itself, so redoing an event's draw no longer pushes slips into the hundreds.
Once a match has been called or played, numbers change only with the button.
**Why:** Requested: reset the score slips to start from 1 (redrawn events kept taking new, higher numbers).
**Files:** `src/data/resets.ts` (`renumberMatches`, `beforeMatchDay`), `src/data/store.ts`,
`src/features/admin/settings/ResetSection.tsx`, `src/data/resets.test.ts`
**Checks:** `npm run check` passes (2127 tests). Headless Chrome: publish MS (#1–94) and WS (#1–139), remove the MS
draw → WS is #1–45; the Settings row shows "already in order"; no console errors.
**Follow-up:** Not committed yet. Draws already in your browser with high numbers: use the Renumber button once.

## 2026-10-16 — A–D: round-1 byes for the top seeds where it's free

**What:** The A–D layout search now runs in two stages: first the fewest players outside their flight (as before),
then, never at that cost, round-1 byes for the seeds, best first (a seed with a bye meets a C/D bye holder in round
2). Club spreading after the search is kept only if it doesn't put anyone outside their flight (it could flip a
same-level match). 12 per level with 8 seeds → the top 4 seeds have byes; 6 per level with 4 seeds → the top 2;
Iowa Men's Doubles → all 8 seeds; Iowa Men's Singles (7 A, 12 B, 17 C, 12 D) → 1 seed, because every A/B player is
needed to beat a C/D player first (an A with a bye takes one C/D player instead of two).
**Why:** Asked whether some byes can go to the top seeds.
**Files:** `src/engine/draws.ts`, `src/engine/draws.test.ts`, `docs/RULES.md`
**Checks:** `npm run check` passes (2124 tests). Misses unchanged (Iowa Men's Singles 3, the minimum); 50–180 ms a draw.
**Follow-up:** Not committed yet.

## 2026-10-16 — A–D flights set by each player's first two matches; byes only in round 1

**What:** A/B/C/D drop flights with levels no longer use byes in the middle of the bracket. A player's flight is
set by their first two matches, whatever rounds they fall in: A win-win, B win-lose, C lose-win, D lose-lose. So
in Flight A a first-match loss drops to C, a second-match loss to B, later losses are out; a player's first C match
decides C or D. All byes are in round 1 (a bye holder's first match is in round 2). The first round is found by a
search that swaps players and byes to minimise the players expected (higher level wins) to finish outside their
level's flight; each match's loser route is fixed from its expected loser. Flight C is arranged the same way (first C
match is C beats D). The draw editor's rebuild passes levels, so edited draws route the same way. The draw page help
explains the win/lose rule.
**Why:** Requested: no mid-bracket byes or skips; fill those places with A v B matches instead; a player may lose
their second match in round 3, as long as A = win, win · B = win, lose · C = lose, win · D = lose, lose.
**Files:** `src/engine/draws.ts`, `src/engine/draws.test.ts`, `src/data/placements.ts`,
`src/features/admin/draws/DrawSetup.test.tsx`, `src/components/draw/EventDraw.tsx`, `docs/RULES.md`
**Checks:** `npm run check` passes (2123 tests). Played out with the higher level winning: 12/12/12/12, 6/6/6/6,
5/5/5/5, 4/4/4/4 → nobody outside their flight, no later byes; demo Men's Singles (7/12/17/12) → 3 (the minimum:
7 A and 12 B can take at most 26 of 29 C/D players in a first match) in 57 of 60 seeds, otherwise 4; about 75 ms a
draw. Headless Chrome: Flight A shows only round-1 byes, round 2/3 pairings as intended.
**Follow-up:** Not committed yet. An upset sends the loser where the expected loser would have gone.

## 2026-10-16 — A–D draws so each player lands in the flight of their level (Byes setting removed)

**What:** Removed the Byes (round 1 / round 2) setting added earlier today, with its migration. A/B/C/D drop
flights with levels are now drawn so each player finishes in the flight of their level: A round 1 is A/B v C/D
(C/D drop to C), A round 2 is A v B (B drop to B), C round 1 is C v D (D drop to D). Byes only where the numbers
need them: extra A/B entries skip round 1, extra A players skip round 2, extra C players skip C round 1, plus
knockout byes later in A and C. Uneven numbers give the fewest mismatches the numbers allow (C/D v C/D in A round 1,
round-2 matches without an A player, D v D in C round 1), each with a warning. Flight B takes A round-2 losers only.
The draw summary counts byes by round (e.g. "4 round-3 byes"). Without levels, with Random draw, for A/B, or when
the draw editor rebuilds a draw, the previous drawing is used (Flight C is still C v D when levels are known).
**Why:** Requested: no Byes setting; byes only when needed; players must fall in the bracket of their level
(e.g. no C v D in A round 1, since the C player would then advance).
**Files:** `src/engine/draws.ts`, `src/engine/pairing.ts`, `src/engine/types.ts`, `src/engine/draws.test.ts`,
`src/features/admin/draws/DrawSettings.tsx`, `src/features/admin/draws/DrawCheck.tsx`,
`src/features/admin/draws/DrawSetup.tsx`, `src/components/draw/EventDraw.tsx`, `supabase/SCHEMA.md`, `docs/RULES.md`;
deleted `supabase/migrations/20261016130000_drop_flight_byes.sql`
**Checks:** `npm run check` passes (2122 tests). Playing draws out with the higher level winning: equal numbers per
level (4/4/4/4, 6/6/6/6, 12/12/12/12, 8/4/2/2 …) → nobody in the wrong flight; demo Men's Singles (7/12/17/12) → 10,
all forced by the numbers (5 C/D v C/D, 5 round-2 matches without an A). Headless Chrome: Flight A and C look right.
**Follow-up:** Not committed yet. A player who skips A round 2 and loses later is out (no drop to B).

## 2026-10-16 — Byes setting for A–D and A–B drop flights (default: round 1)

**What:** A new **Byes** setting (Round 1 / Round 2) for A/B/C/D and A/B drop flights, next to Pairing.
**Round 1** (default): the top seeds skip round 1 as in any knockout; the A/B entries left play the C/D entries and
any C/D entries beyond that meet each other (the warning says the round-1 byes are why). **Round 2**: the behaviour
from earlier today, everyone plays round 1 (C/D v A/B) and the byes move to round 2. Stored as `dropByes` on the
event config and a `drop_byes` column in the database.
**Why:** Requested, with round 1 as the default.
**Files:** `src/engine/types.ts`, `src/engine/pairing.ts`, `src/engine/draws.ts`, `src/engine/draws.test.ts`,
`src/data/assign.test.ts`, `src/features/admin/draws/DrawSettings.tsx`,
`supabase/migrations/20261016130000_drop_flight_byes.sql`, `supabase/SCHEMA.md`, `docs/RULES.md`
**Checks:** `npm run check` passes (2126 tests, migration applies). Headless Chrome, demo Men's Singles (19 A/B,
29 C/D): Round 1 → 16 round-1 byes and 13 C/D v C/D with the explaining warning; Round 2 → 8 round-2 byes and 5
C/D v C/D; no console errors.
**Follow-up:** Not committed yet. Existing events default to Round 1, so a draw drafted with round-2 byes changes
until Byes is set to Round 2.

## 2026-10-16 — Draw setup redraws when levels change

**What:** The draw preview on the setup screen now recalculates when an entry's level changes (in the seeding
panel or on the entries page), not only when the order, settings or shuffle change. Before, a level change left
the old pairings in place while the "Round 1 levels" chips relabelled them with the new levels, so the draw looked
updated when it wasn't.
**Why:** Reported: levels were updated in the seeding panel but the A–D draw still treated the field as 19 A/B.
**Files:** `src/features/admin/draws/DrawSetup.tsx`, `src/features/admin/draws/DrawSetup.test.tsx`
**Checks:** `npm run check` passes (2123 tests). The new test fails without the fix (the draw's own C/D-v-C/D
warning stays after every C becomes a B) and passes with it.
**Follow-up:** Not committed yet. In A–D the A/B v C/D split follows levels, not the order of the seeding list.

## 2026-10-16 — A–D flight: round 2 is A v B, not B v B

**What:** When Flight A has round-2 byes, they are no longer all given to the best-ranked round-1 winners (the
A players). They're split between the top band (A) and the rest so that the players left in round 2 are half each,
and round 2 pairs best against worst, so A players meet B (or C) players. Men's Singles in the demo: round 2 was
B v B throughout; now A v C ×5, A v B ×2 and one B v B (7 A and 9 others play round 2, so two others must meet);
8 B players skip round 2. Top seeds may now play round 2 instead of skipping it.
**Why:** Reported: B v B matches in round 2 of the A–D flight.
**Files:** `src/engine/pairing.ts`, `src/engine/draws.test.ts`, `docs/RULES.md`
**Checks:** `npm run check` passes (2122 tests).
**Follow-up:** Not committed yet.

## 2026-10-16 — First-match scoring only when both players are new

**What:** In knockouts and drop flights, the first-match format (e.g. one game to 30) is now used only when both
players are playing their first match in the event. A player coming off a bye who meets someone who has already
played now plays full sets (the main format). Two bye holders meeting still play the first-match format.
Group matches in round robin are unchanged.
**Why:** Requested.
**Files:** `src/engine/rules.ts`, `src/engine/roundRules.test.ts`, `src/data/assign.test.ts`,
`src/features/admin/entries/EventDialog.tsx` (hint text), `docs/RULES.md`
**Checks:** `npm run check` passes (2121 tests).
**Follow-up:** Not committed yet. The format is worked out per match from who is in it, so an already-published
draw switches to the new rule straight away.

## 2026-10-16 — Cleaner bracket lines

**What:** Brackets now use a tree layout: drawn first-round matches stack with no gaps, and each later match sits
midway between the matches its players come from. Connectors are elbow lines drawn in one SVG layer (out of the
match, down or up in the gap, into the next match). A player who skips a round with a bye gets one straight line
across that column instead of stubs that stop in empty space. Flight A with round-2 byes names its rounds
"Round 1, Round 2 …" instead of "Round of 64" for a 48-player field. Full brackets (knockouts, lower flights,
the draw editor) keep the same shape.
**Why:** Requested: the A–D flight lines were hard to follow (gaps where round-2 byes sat, long lines through
the round-2 column, matches off-centre from their feeders).
**Files:** `src/components/draw/Bracket.tsx`, `src/engine/draws.ts`
**Checks:** `npm run check` passes (2121 tests). Headless Chrome on the demo Men's Singles A–D (Flight A and C)
and a knockout preview; no console errors.
**Follow-up:** Not committed yet.

## 2026-10-16 — Move placement-round byes by hand

**What:** In the draw editor (Edit placements) for a "By results" draw, an **Add a bye line** button adds an empty
round-1 line. Take a player out of their match and put them in it: they get a bye, and so does their opponent unless
that place is filled. Empty added lines are ignored and can be removed. On publish the placement rounds are rebuilt
and renumbered; the added lines rank after the published ones. Existing byes could already be moved (now tested).
Only before any match in the event is played, and only for placement rounds.
**Why:** Requested: organizers want to move the byes in the placement round themselves (e.g. when the draw gives none).
**Files:** `src/features/admin/draws/DrawEditor.tsx`, `src/data/placements.ts`, `src/engine/draws.ts`, `src/data/placements.test.ts`
**Checks:** `npm run check` passes (2121 tests). Headless Chrome on the demo Men's Singles by results (no round-1
byes): added a line, moved Mathew Paramben into it, published; he and his opponent Cheng Liang Chang got round-1
byes and went straight into round 2 upper; no console errors.
**Follow-up:** Not committed yet. Later rounds don't preview in the editor while added lines are in use (they update on publish).

## 2026-10-16 — By results: C/D entries play A/B entries in placement round 1

**What:** In "By results" draws, placement round 1 now pairs every C/D entry with an A/B entry: A/B entries form
the top half and C/D entries the bottom half (each in seeding order), and round-1 byes are capped so enough A/B
entries stay in round 1. Clubmate swaps never create a C/D v C/D match. When C/D entries outnumber A/B entries the
unavoidable C/D v C/D matches are kept to the minimum and the draw warns. The seeding-list hint and RULES.md say so.
**Why:** Reported: C beat D in round 1, went to round 2 upper, lost to a stronger player and landed in Flight B.
**Files:** `src/engine/draws.ts`, `src/engine/placement.test.ts`, `src/features/admin/draws/SeedingList.tsx`, `docs/RULES.md`
**Checks:** `npm run check` passes (2118 tests). Seed Men's Singles (19 A/B, 29 C/D) by results: 19 A/B v C/D and
5 C/D v C/D round-1 matches (was 12 C v D).
**Follow-up:** Not committed yet. Fields with 12 per level now get no round-1 byes (flights of 12) instead of 16 byes.

## 2026-10-16 — Placement rounds ("By results") back

**What:** Restored the "By results" drop flight from the last commit: the engine (`placementDraw`), the Placement
tab (`PlacementTree`) and its tests, the By results option and Byes setting, the setup header ("2 placement rounds,
then 4 flights"), the seeding-list wording, and the rules in RULES.md. The uncommitted migration that dropped
`placement_byes` was deleted and the schema doc restored, and saved browser data is no longer converted from
By results to A/B/C/D. Kept from today: A/B/C/D stays the default for new events, and its C/D-v-A/B round 1,
round-2 byes and bracket lines are unchanged. The old "Use By results" tip on the setup screen was not restored:
it said lower levels meet in A/B/C/D round 1, which is no longer true.
**Why:** Requested.
**Files:** `src/engine/draws.ts`, `src/engine/types.ts`, `src/engine/placement.test.ts`,
`src/components/draw/PlacementTree.tsx`, `src/components/draw/EventDraw.tsx`, `src/components/draw/Bracket.tsx`,
`src/components/draw/modeLabels.ts`, `src/data/queries.ts`, `src/data/store.ts`,
`src/features/admin/draws/DrawSettings.tsx`, `src/features/admin/draws/DrawSetup.tsx`,
`src/features/admin/draws/SeedingList.tsx`, `supabase/SCHEMA.md`, `docs/RULES.md`; deleted
`supabase/migrations/20261016120000_remove_drop_flight_placement.sql`
**Checks:** `npm run check` passes (2116 tests). Headless Chrome: Men's Singles switched to By results shows the
Placement tab (round 1, round 2 upper and lower) and flights A–D; no console errors.
**Follow-up:** Not committed yet.

## 2026-10-16 — Seed data from the real Iowa Open 2026 player list

**What:** The demo tournament (Iowa Open Test 26) now holds the real field from "Iowa Open 2026 Players.xlsx"
(tournamentsoftware.com export): 121 players, 178 entries (MS 48, WS 24, MD 35, WD 21, XD 50). Every event is an
A/B/C/D drop flight. Singles use Level1, doubles Level2. Doubles partners were matched from the typed partner
names (84 mutual pairs, the rest one-way); 2 MD entries name a partner who isn't on the list (pending partner),
and 9 doubles entries with no partner given wait for the organizer (status pending). Birth dates and home towns
were left out (birth year = tournament year − 25, as the entry-list import does). The demo Player account is
linked to Kiara Sta Maria (p-28).
**Why:** Requested: import the real player list into the seed data, with drop flight as the default event type.
**Files:** `src/data/seed/iowaOpenEntries.ts` (generated), `src/data/seed/iowaOpen.ts`, `src/config/demo.ts`,
`src/test/fixtures/sampleTournaments.ts`, `src/data/simulate.test.ts`, `src/data/placements.test.ts`,
`src/data/assign.test.ts`
**Checks:** `npm run check` passes (2062 tests). Drawn from the seed, every event has more C/D than A/B entries,
so each draw has a few C/D v C/D round-1 matches (MS 5, WS 5, MD 6, WD 4, XD 6) and says so.
**Follow-up:** Not committed yet. Saved browser data keeps the old demo until Settings → Reset demo data.
The repo now contains real entrants' names and clubs (the old seed deliberately used invented names); check
before publishing the demo anywhere public.

## 2026-10-16 — Bracket line through a round-2 bye

**What:** When a round-1 winner skips round 2, the bracket now draws a straight line across the round-2 column to
their round-3 match, instead of a line that stops in empty space.
**Why:** Reported: the draw looked disconnected after round-2 byes were added.
**Files:** `src/components/draw/Bracket.tsx`
**Checks:** `npm run check` passes. Headless Chrome on the demo MS drop flight: round-1 matches #4, #7, #8 connect
through the Round of 32 to their Round of 16 matches.
**Follow-up:** Not committed yet.

## 2026-10-16 — Drop flight: C/D entries never meet in A round 1

**What:** In Flight A round 1 every C/D entry now plays an A/B entry. When there are more C/D entries than the
usual round-1 matches (N − S/2), round 1 gets one match per C/D entry, fewer top players get round-1 byes and the
other byes move to round 2 (the best-ranked round-1 winners skip it). Flight B takes the losers of each player's
second A match (round 2, or round 3 for anyone who skipped round 2), so nobody leaves A before their third match.
No C/D entry gets a bye. If C/D entries outnumber A/B entries the unavoidable C/D v C/D matches are kept to the
minimum and the draw warns. The setup header counts byes as drawn, and the round-1 summary shows round-2 byes.
**Why:** Requested: C and D players should lose their first A match (to an A/B player) and drop to C, not beat each other.
**Files:** `src/engine/pairing.ts` (`arrangeDropFlight`), `src/engine/draws.ts`, `src/engine/draws.test.ts`,
`src/components/draw/Bracket.tsx`, `src/components/draw/EventDraw.tsx`, `src/features/admin/draws/DrawSetup.tsx`,
`src/features/admin/draws/DrawCheck.tsx`, `docs/RULES.md`
**Checks:** `npm run check` passes. Headless Chrome on the demo MS drop flight (39 entries, 21 C/D v 18 A/B): round 1
shows 2 C v D (the minimum), 1 bye, 12 round-2 byes; Flight B is fed by round-2 and round-3 losers; no console errors.
**Follow-up:** Not committed yet. With "Random draw" pairing levels are ignored, so C/D can still meet.

## 2026-10-16 — Placement rounds removed from drop flights

**What:** Removed the "By results" drop flight (two placement rounds, then flights) and the **Placement** tab on the
draws page. Every drop flight now starts everyone in Flight A: lose A round 1 → C, lose A round 2 → B, lose C round 1
→ D; winning A rounds 1 and 2 keeps you in A, winning C round 1 keeps you in C. A/B/C/D is the default for new events
(A/B is still available). Gone with it: the "By results" option, the Byes setting, the "Use By results" tip on the
setup screen, and the placement wording in the seeding list.
**Why:** Requested: no placement section; flights should follow the classic A/B/C/D drop rules.
**Files:**
- Engine: `src/engine/draws.ts`, `src/engine/types.ts`; deleted `src/engine/placement.test.ts`
- UI: `src/components/draw/EventDraw.tsx`, `src/components/draw/Bracket.tsx`, `src/components/draw/modeLabels.ts`,
  `src/features/admin/draws/DrawSettings.tsx`, `src/features/admin/draws/DrawSetup.tsx`,
  `src/features/admin/draws/SeedingList.tsx`, `src/features/admin/entries/EventDialog.tsx`,
  `src/features/admin/home/NewTournamentDialog.tsx`; deleted `src/components/draw/PlacementTree.tsx`
- Data: `src/data/queries.ts`, `src/data/store.ts` (store version 12; saved version-11 data is kept and its By results
  events become A/B/C/D. The first version of this change reset saved data to the demo instead)
- Database: `supabase/migrations/20261016120000_remove_drop_flight_placement.sql` (By results events → ABCD, drops
  `placement_byes`), `supabase/SCHEMA.md`
- Docs: `docs/RULES.md`
**Checks:** `npm run check` passes (2051 tests, migrations apply).
**Follow-up:** Not committed yet. `PLACEMENT` stays in the Postgres `drop_variant` enum (enum values can't be dropped) but nothing uses it.

## 2026-10-16 — "Byes" setting for By results draws (round 1 by default)

**What:** New **Byes** menu next to Pairing for "By results" draws: **Placement round 1** (default, as requested:
the top of the seeding order skips round 1, as many as make every flight a clean knockout), **Placement round 2**
(the previous behaviour) or **In the flights** (everyone plays both placement rounds; byes in each flight's Round 1).
Byes always go to the top-ranked. Round-1 bye holders are spread in seed positions (seed 1 top, seed 2 bottom).
Browser, 12 per level (48): round 1 → 16 byes, round 1 B v C ×4, B v D ×4, C v D ×8, flights 16/16/8/8, 84 matches;
round 2 → A v C ×12, B v D ×12, flights 16/8/16/8, 84; flights → A v C ×12, B v D ×12, flights 12 each, 92.
**Files:** `src/engine/draws.ts`, `src/engine/types.ts` (`EventConfig.placementByes`), `src/engine/placement.test.ts`
(every field size × every setting), `src/features/admin/draws/DrawSettings.tsx`, `SeedingList.tsx`,
`supabase/migrations/20261015120000_drop_flight_placement.sql` (`events.placement_byes`), `docs/RULES.md`.
**Checks:** `npm run check` (2105 tests, migration check).
**Follow-up:** Not committed yet. Organizer was advised byes in the flights give top players more good matches;
the setting lets them compare per event.

## 2026-10-16 — Round-2 byes in the lower group go to the best C players, not D

**What:** Fixed: with Ranked order (A1 v D12, A2 v D11 …), the lower group was ordered by round-1 match, so the
losers of the A v D matches (D players) came first and got the byes straight into Flight C. The lower group is now
ordered by the losing player's own place in the seeding order, so the byes go to C1–C8 (12 per level) and D
players never get one. Close levels was unaffected (its first losers are C players). Upper-group byes were
already right (A1–A8).
**Files:** `src/engine/draws.ts`, `src/engine/placement.test.ts` (both pairings: byes go to A1–A8 and C1–C8),
`docs/RULES.md`.
**Checks:** `npm run check` (2077 tests).
**Follow-up:** Not committed yet. Redo any "By results" draw made with Ranked order before this fix.

## 2026-10-16 — Added the "reverse-engineer-anything" Claude skill (REA)

**What:** Copied the `reverse-engineer-anything` skill from [morluto/rea](https://github.com/morluto/rea)
(commit `42fc6c5`, MIT) into `.claude/skills/reverse-engineer-anything/`: SKILL.md, six reference guides, the
licence and a SOURCE.txt. It's instructions only; REA's MCP server/CLI was **not** installed or registered (that
needs `npx rea-agents setup`, which writes Claude config and needs approval). The repo's other skills (changelog, CI
audit, tool design) are for developing REA itself and were left out.
**Why:** Requested. Useful for analysing other people's software (e.g. how tournamentsoftware.com's planner stores
or exports data); the skill says not to use it on our own source.
**Checks:** All seven files read before copying (no scripts or hooks); copy verified identical to the source.
**Follow-up:** Not committed yet. Available in new Claude Code sessions in this project.

## 2026-10-15 — Placement byes in round 2 for the top-ranked; flights without byes

**What:** In "By results" draws the byes now go to the best-ranked players in **placement round 2**, as many as make
the flights clean knockout sizes (at most half of each group; the losers' flight needs at least 2). For 48 entries
(12 per level): round 1 has 24 matches as before (A v C / B v D or A v D / B v C); in round 2 the top 8 of each group
go straight into Flight A or C and the other 16 play; flights are 16 / 8 / 16 / 8 with **no byes inside any flight**
(84 matches instead of 92). Odd fields: the top seed's round-1 bye; nobody gets two byes. Ranked order now pairs
1 v last in round 2 as well. The Placement tab shows round 1, round 2 upper and lower, and "Bye: straight into A / C".
**Why:** Organizer: byes belong in the placement rounds, for the higher-ranked players, not inside a flight.
Trade-off accepted: with 12 per level, Flight A gets 4 B players and Flight C 4 D players (results to form).
**Files:** `src/engine/draws.ts` (`placementDraw`), `src/engine/placement.test.ts`, `src/components/draw/PlacementTree.tsx`,
`src/components/draw/EventDraw.tsx`, `docs/RULES.md`.
**Checks:** `npm run check` (2075 tests). Browser: 12/12/12/12 draft shows 8 round-2 byes per group; published and
played everything (269/269): flights 16/8/16/8 with no bye cards.
**Follow-up:** Not committed yet. The Placement tab is columns now, not a strict tree (round 2 no longer pairs
neighbouring round-1 matches).

## 2026-10-15 — Placement flights: byes only in Round 1, never two byes, no knockout before game 3

**What:**

- Flights after placement rounds name their rounds Round 1, Round 2 … Semi-final, Final (was "Round of 16 /
  Quarter-final", so a first-round bye in a small flight looked like a bye in the QF or SF). Byes only ever sit in
  a flight's Round 1, which is everyone's game 3, the first game you can be knocked out in.
- Nobody gets two byes: with an odd field, the lone round-2 group is no longer the round-1 bye (the top seed
  could skip games 1 and 2, e.g. 45 entries), and a flight's byes skip players who already had a bye.
- A slot fed by a "player v bye" card now says "Winner of #25" instead of "To be decided".

**Why:** Organizer: byes deep in a draw sound wrong; no knockouts until players have played 3 games.
**Files:** `src/engine/draws.ts`, `src/engine/types.ts` (`Stage.numberedRounds`), `src/engine/placement.test.ts`
(48/47/46/45/33/12/9 entries: at most one bye each, nobody out before game 3), `src/components/match/matchInfo.ts`,
`docs/RULES.md`.
**Checks:** `npm run check` (2074 tests). Browser: Flight A shows Round 1 · Round 2 · Semi-final · Final, byes only in Round 1.
**Follow-up:** Not committed yet.

## 2026-10-15 — "Ranked order" pairing for placement rounds

**What:** The Pairing menu is back for **By results** draws, with two ways to pair round 1: **Close levels (1 v 25)**,
A v C and B v D, as before (default), and **Ranked order (1 v 48)**, A v D and B v C, the organizer's suggestion.
Round 2 and the flights work the same either way. The help text, format description and Seeding order panel show the
pairing in use.
**Files:** `src/engine/draws.ts`, `src/engine/placement.test.ts`, `src/features/admin/draws/DrawSettings.tsx`,
`SeedingList.tsx`, `docs/RULES.md`.
**Checks:** `npm run check` (2066 tests). Browser, 12/12/12/12 field: Close levels gives A v C ×12, B v D ×12;
Ranked order gives A v D ×12, B v C ×12.
**Follow-up:** Not committed yet.

## 2026-10-15 — Seeding order copy / paste / drafts; placement tree; A–D hint

**What:**

- Seeding order panel: **Copy list** (rank, name, level as tab-separated rows; pastes into Excel or Sheets as three
  columns), **Paste list** (reads that back, or just a column of names; matches names with small typos and short names;
  applies levels when given; shows how many matched and which rows weren't recognised; entries left out stay at the
  end), and **Drafts** (save named versions of order + levels, load or delete them; kept in this browser per event).
  Paste and Load are one undoable step each; Save still has to be pressed.
- "By results" draws show the two placement rounds as one **Placement** tab drawn as a tree: each pair of round-1
  matches joins and forks to the round-2 upper (winners) and lower (losers) match, then "Winner → A / Loser → B" and
  "Winner → C / Loser → D". Flights A–D stay as bracket tabs.
- Events still on A–D or A–B show a hint explaining why lower levels meet in round 1, with **Use By results**.

**Why:** Organizer's Men's Singles was still on A–D (C v D ×8 in round 1); wanted to copy/paste the seeding instead
of re-entering it, and a tree to the right of the placement rounds.
**Files:** `src/features/admin/draws/SeedingList.tsx`, new `seedingText.ts` (+ test), `DrawSetup.tsx`,
`src/components/draw/EventDraw.tsx`, new `src/components/draw/PlacementTree.tsx`; `SeedingList.test.tsx`.
**Checks:** `npm run check`. Browser: Placement tab shows 12 groups with connectors for the 12/12/12/12 field.
**Follow-up:** Not committed yet. Drafts live in this browser only (not shared with other staff).

## 2026-10-15 — Placement draw follows the seeding order; Save in Seeding order fixed

**What:**

- **Bug:** Save in the Seeding order panel undid the changes. Closing the dialog fires its close event, which was
  wired to Cancel, so every Save restored the old order and levels. Now Save clears the "restore" snapshot first.
  The test setup's dialog now fires "close" like browsers do, so the test catches this (it fails without the fix).
- The "By results" draw now uses the Seeding order list exactly as round 1's ranking (it used to keep only the seeds
  and re-sort everyone else by level, ties by lot). The panel says so: "Round 1 follows this list exactly…".
- Placement matches are laid out as a tree in seed positions: seed 1 at the top, seed 2 at the bottom, each
  round-2 match next to its two round-1 matches. Published layouts rebuild the same draw in the draw editor.

**Why:** The organizer set 12 players per level in Seeding order, but the draw still showed C v D and seeds 1–2 together.
**Files:** `src/engine/draws.ts` (`placementDraw`, `seedPositions`), `src/engine/placement.test.ts`,
`src/features/admin/draws/DrawSetup.tsx`, `SeedingList.tsx`, `src/test/setup.ts`, `docs/RULES.md`.
**Checks:** `npm run check` (2058 tests). Browser (headless Edge): imported the real list, changed levels in Seeding
order to 12 A / 12 B / 12 C / 12 D, Save, reload: round 1 A v C ×12, B v D ×12; seed 1 top line, seed 2 bottom pair.
Published and played everything: round 2 upper A v B ×12, lower C v D ×12; flights A 12 A, B 12 B, C 11 C + 1 D
(upset), D 11 D + 1 C.
**Follow-up:** Not committed yet. Seeding changes "saved" before this fix were lost; redo them once.

## 2026-10-15 — Seeding order: Save and Cancel

**What:** The Seeding order panel's footer has **Cancel** and **Save** (was "Done"). Cancel (and closing with ×,
Esc or a click outside) puts the order and any levels changed in the panel back as they were when it opened.
Save keeps the changes and closes.
**Files:** `src/features/admin/draws/DrawSetup.tsx`, `SeedingList.tsx`, new `seedingSnapshot.ts`; new test `DrawSetup.test.tsx`.
**Checks:** `npm run check`.
**Follow-up:** Not committed yet.

## 2026-10-15 — Drop flight by results (placement rounds)

**What:** New drop flight format **By results** (default for new events), from the organizer's spec. Round 1 is the
whole field, top half v bottom half by count. Round 2: winners v winners and losers v losers, paired on the expected
order (A v B upper, C v D lower). Upper winners → Flight A, upper losers → B, lower winners → C, lower losers → D;
each flight is then a seeded knockout. Odd group: top-ranked gets a bye. Clubmates kept apart in round 1 and the
expected round-2 matches. The draw is fixed when published (round-2 slots are "winner/loser of #n"), so after an
upset the round-2 pairs are the published ones rather than re-sorted (organizer's choice: draws must not change).
Replaces a "two tiers by level" option tried earlier the same day (never shipped).
**Why:** Round 1 paired C v D (byes went to the top 16), so C players stayed in A. Simulated on the real lists
(higher level always wins): Men's Singles flights of 12: A 7 A + 5 B, B 7 B + 5 C, C 12 C, D 12 D; all 306 matches
play through. Before (A/B/C/D): B flight 3 B + 13 C.
**Files:** `src/engine/draws.ts` (`placementDraw`), `src/engine/types.ts` (`PLACEMENT`, `Stage.placement`),
new test `src/engine/placement.test.ts` (spec acceptance tests), `src/components/draw/EventDraw.tsx` (tabs for
Round 1 / Round 2 upper / lower / flights), `Bracket.tsx`, `modeLabels.ts`, `src/data/queries.ts`,
`src/features/admin/draws/DrawSettings.tsx`, `EventDialog.tsx`, `NewTournamentDialog.tsx`,
`supabase/migrations/20261015120000_drop_flight_placement.sql`, `supabase/SCHEMA.md`, `docs/RULES.md`.
**Checks:** `npm run check`. Editing a published placement draw (swapping round-1 players) works.
Browser test (headless Edge against the dev server, fresh profile): imported the real list (178 entries), set Men's
Singles to By results, published, ran the Simulator (Play everything: 277/277 matches). Tabs Round 1 24/24, Round 2
upper/lower 12/12, flights A–D of 12 each with champions; level tags shown on organizer pages, not on the public draw.
Fixed while testing: setup summary said "64-draw · 16 byes" (now "2 placement rounds, then 4 flights"), flight tabs
counted bye slots as matches (0/15 → 0/11), the format text described A–D, and the Pairing menu (unused here) is hidden.
**Follow-up:** Not committed yet. Existing events keep their format: set Flights to **By results** in the draw
settings for Men's Singles and Mixed Doubles, then redo the draw. A player with a round-1 bye plays round 2 in the
first-match format (one game to 30) only if the event uses it; that's unchanged behaviour.

## 2026-10-15 — Undo, redo and reset in the seeding order

**What:** The Seeding order panel has **Undo** and **Redo** buttons (also Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z or Ctrl+Y
while the panel is open) covering every change made there: moves, drags, "Sort by level" and level changes.
**Reset order** goes back to the automatic order (seeds, then strongest level first); it can be undone too.
The level menus now show just the letter (the menu still lists "A · Advanced" etc.), so names have more room,
and they stand out on the grey seeded rows.
**Why:** Easier to experiment with the order and step back.
**Files:** `src/features/admin/draws/SeedingList.tsx` (+ new test), `DrawSetup.tsx`, `src/components/ui/Select.tsx`
(`renderValue`, `title`), `src/components/ui/Icon.tsx` (redo).
**Checks:** New tests pass; `npm run check`.
**Follow-up:** Not committed yet. History lasts while the panel is open; closing it starts fresh.

## 2026-10-15 — No same-level first-round matches when it can be avoided

**What:** When the entries left to play round 1 (after byes) are more than half one level, a few of them now
swap with the lowest-ranked unseeded bye-holders of other levels. Seeds keep their byes; a swap is skipped if
it would make keeping clubmates apart impossible. Clubmate-separation swaps also avoid creating same-level pairs.
**Why:** On the real list, Men's Doubles (35 pairs, 29 byes) had all 3 first-round matches D/D v D/D, and
Men's Singles had a C v C. Now 0 same-level first-round matches in every event (checked with 3 draw seeds).
Also checked drop flights with "higher level always wins": flights already end up sorted by level as far as
the entry counts allow (MS: B flight 3 B + 13 C, C flight 4 C + 12 D, D flight all D), so round-2 pairing is unchanged.
**Files:** `src/engine/pairing.ts` (`chooseByes`, club-fix preference), `src/engine/pairing.test.ts`, `docs/RULES.md`.
**Checks:** `npm run check`.
**Follow-up:** Not committed yet. Draws already published keep their old pairings until redone.

## 2026-10-15 — Levels in draws, editable in seeding, byes drawn in round 1

**What:**
- On the organizer's Draws page, every bracket line and group table row shows the entry's skill level for that event
  next to the name and seed ("B", or "B/C" for a pair). The public draws page doesn't show levels.
- The seeding order panel shows each player's level for the event as a small menu; changing it updates the entry
  (same as on the Entries page) and "Sort by level" uses it.
- Brackets now draw first-round byes as "Player vs Bye" cards, so every player starts in the left column in
  draw order (before, bye players first appeared in round 2). Applies to the public bracket too.
**Why:** Easier to check the draw is balanced and to follow the tree.
**Files:** `src/components/match/Match.tsx`, `src/components/draw/Bracket.tsx`, `Groups.tsx`, new `showLevels.ts`,
`src/components/tournament/Badges.tsx` (`LevelTag`), `src/data/lookup.ts` (`entryLevels`),
`src/features/admin/draws/DrawBuilder.tsx`, `SeedingList.tsx`.
**Checks:** `npm run check` passes (2038 tests). Not tried in the browser yet.
**Follow-up:** Not committed yet. No dedicated tests for the new level tags/menus.

## 2026-10-15 — Search and sort entries

**What:** Each event's entry list on the Entries page has a search box (player, partner or club; ignores
case and accents; several words narrow it down) and a **Sort by** menu: seeding order (default),
name A–Z, club A–Z, level (strongest first), newest first. Works together with the status filter.
**Why:** With the real list loaded (up to 50 entries per event), entries were hard to find.
**Files:** `src/features/admin/entries/EventEntries.tsx`; new test `EventEntries.test.tsx`.
**Checks:** New tests pass; `npm run check`.
**Follow-up:** Not committed yet.

## 2026-10-15 — Import and export the entry list

**What:** The Entries page has **Import** and **Export** buttons. Import reads the tournamentsoftware.com
"Players" export (.xlsx or .csv), or a file exported from here, and shows a preview before changing anything:
new/updated players, entries per event, withdrawals, and a "Worth a look" list (partner not on the list,
no partner given, two people naming different partners). Confirming replaces the tournament's entries with
the list (unchanged entries keep their id and seed; players who drop out entirely are removed unless they
have an account). Doubles partners are matched from the free-text "Entry Info", tolerating typos and short
names and preferring pairs who name each other. Import is refused once any draw is made. Export writes the
same layout as .xlsx, so it can be edited in Excel and imported again.
**Why:** Load the real Iowa Open 2026 entry list (121 players) without copying real names into the code.
**Files:** `src/lib/xlsx.ts` (no new dependency), `src/data/entryList.ts`, `src/data/store.ts` (`importEntryList`),
`src/features/admin/entries/ImportEntriesDialog.tsx`, `entryListFile.ts`, `AdminEvents.tsx`, `src/components/ui/Icon.tsx`;
tests `src/lib/xlsx.test.ts`, `src/data/entryList.test.ts`, `ImportEntriesDialog.test.tsx`.
**Checks:** New tests pass (20). Tried against the real file: all 121 players read, 178 entries + 2 withdrawn,
export → re-import changes nothing.
**Follow-up:** Not committed yet. On the real list, check: Kent Sta Maria (XD names Kasia Klapacz, who is paired
with Mathew Paramben), Billy Dang (MD names "Lucas Chen", paired with Ssu Tsan Chang), Satya Kosaraju's MD partner
"Shunquin" (Shun Quinlan is female), and 9 doubles entries with no partner given.

## 2026-10-13 — Score slip shows the right number of games

**What:** The score dialog now always shows exactly one row per game of the match's format (1 row for one game
to 30, 3 for best of 3). A half-typed slip saved on the device under a different format is fitted to the current one.
**Why:** Saved slips kept their old 3 rows, so matches that now use first-match scoring (one game to 30) still showed 3 games.
**Files:** `src/components/match/ScoreEntry.tsx`; new test `src/components/match/ScoreEntry.test.tsx`
(fails without the fix).
**Checks:** `npm run check` passes.
**Follow-up:** Not committed yet.

## 2026-10-12 — First-round scoring follows each player's first match

**What:** An event's "first round scoring" (e.g. one game to 30) now applies to each player's first match
instead of "round 1 of every bracket". A player with a bye plays their first real match (usually round 2)
in the short format, even when their opponent has already played. Players who drop to a lower flight (B/C/D)
or the plate, and the 3rd-place match, play the normal format. Round-robin groups are unchanged
(all group matches use it).
**Why:** Players with byes were missing their short first match, and dropped players were wrongly getting it again.
**Files:** `src/engine/rules.ts` (`rulesIdForMatch`, new `isFirstMatchSlot`), `src/data/ops.ts`, `src/data/lookup.ts`,
`src/features/admin/entries/EventDialog.tsx` (hint text), `docs/RULES.md`; tests in `src/engine/roundRules.test.ts`,
`src/data/assign.test.ts` (real ABCD draw) and `supabase/tests/schema.test.ts`.
**Checks:** `npm run check` passes (2014 tests).
**Follow-up:** Not committed yet. Decided 2026-10-13 to keep round robin as it is: every group match uses the
first-round scoring, so standings compare results played in the same format.

## 2026-10-12 — Warning before calling players who haven't checked in

**What:** On the courts desk, sending a match to a court (Call, drag and drop, or the suggested match on a free court)
now asks first when any of its players haven't checked in: "Amir Rao and Hao Alvarez haven't checked in yet…"
with **Cancel** / **Send anyway**. **Fill free courts** lists every match about to be sent that has absent
players, with **Cancel** / **Fill anyway**. No warning when everyone has checked in, or before registration closes.
**Why:** Avoid calling players to a court before they've arrived.
**Files:** `src/features/admin/courts/CourtBoard.tsx`, `src/data/checkIns.ts` (`notCheckedIn`, + test)
**Checks:** `npm run check` passes. Tried in the browser: warning on Call, Cancel keeps the court free,
Send anyway sends, no warning for checked-in players, Fill warning lists matches and Fill anyway fills.
**Follow-up:** Not committed yet. The simulator still fills courts without asking (test runs only).

## 2026-10-12 — Simpler player cards

**What:** Player cards on the Players page now show only the essentials: check-in mark, name, level, status,
events and the main action (Check in / Score). Check-in time (with Undo), club, matches played and the
match line ("Can be called now · #21 MS R32") moved into a details panel opened with the arrow button on each card.
**Why:** The cards were overloaded.
**Files:** `src/features/admin/players/LivePlayers.tsx`
**Checks:** `npm run check` passes. Tried in the browser: cards collapsed by default, details open and close,
Undo works from the details, no sideways scrolling at phone width.
**Follow-up:** Not committed yet.

## 2026-10-10 — Check-in moved onto the Players page

**What:** Removed the separate Check-in page and built check-in into **Players** (formerly "Live players").
A Check-in panel at the top shows progress, filters *All / Not here yet / Checked in*, a key for the marks
and a **New day** button. Search, then press Enter to check in the only player found. Each player card shows
"Checked in 8:32 PM · Undo", or "Not checked in yet" with a **Check in** button and an amber dashed border.
The sidebar Players item shows how many players are still to arrive. Old `/check-in` links redirect to Players.
**Why:** Simpler: one place for everything about players, with check-in front and centre.
**Files:** `src/features/admin/players/LivePlayers.tsx`, `src/features/admin/AdminShell.tsx`, `src/app/routes.tsx`,
`src/app/routes.test.tsx`; deleted `src/features/admin/checkin/CheckInPage.tsx`.
**Checks:** `npm run check` passes (2007 tests). Tried in the browser at desktop and phone width.
**Follow-up:** Not committed yet.

## 2026-10-10 — Player check-in

**What:** Organizers can check players in as they arrive. A new **Check-in** page (sidebar) shows progress
("7 of 96 checked in"), lets staff search, check in or undo, and has a **New day** button that clears
check-ins. Across the organizer screens (courts queue, Live players), each name shows a green tick when
the player is checked in, or an amber circle and greyed-out name when not. The marks appear once registration closes.
Owners, admins and scorers can use it; players and the public never see check-ins.
**Why:** Organizers need to know who has arrived at the start of the day.
**Files:**
- Data: `src/data/checkIns.ts` (+ test), `src/data/types.ts`, `src/data/store.ts`, `src/data/queries.ts`
- UI: `src/features/admin/checkin/CheckInPage.tsx`, `src/components/tournament/CheckInName.tsx` (+ test),
  `src/features/admin/courts/QueueRows.tsx`, `src/features/admin/players/LivePlayers.tsx`,
  `src/features/admin/AdminShell.tsx`, `src/app/routes.tsx`, `src/app/routes.test.tsx`
- Database: `supabase/migrations/20261010130000_check_ins.sql`, `supabase/tests/schema.test.ts`, `supabase/SCHEMA.md`
**Checks:** `npm run check` passes (2007 tests). Tried in the browser at desktop and phone width.
**Follow-up:** Not committed yet. Check-in doesn't stop the desk calling an absent player; it could warn or skip them.
Data is saved in browser localStorage only until the store uses Supabase.

## 2026-10-10 — Multi-day schedule (removed)

**What:** A day planner (events and later knockout rounds per day, "Start day 2" on the courts desk) was built,
then removed by request. No code from it remains.

## 2026-10-09 — Fixed "cannot find module rolldown-binding" error

**What:** Deleted `node_modules` and ran `npm install` again.
**Why:** The app and tests would not start: rolldown's native Windows binary was missing (npm optional-dependency bug).
**Files:** `package-lock.json` (changed by the reinstall).
**Checks:** All tests passed afterwards.
**Follow-up:** If the error comes back on another machine, reinstall there; don't copy `node_modules` between machines.

## 2026-10-09 — Earlier commits

- `663da8f` Draw fixed with holding
- `b63f040` Smashboard: badminton tournament platform (initial version)
