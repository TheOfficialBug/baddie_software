# Competition rules in Smashboard

This is every competition rule the app applies: scoring, eligibility, draws, seeding, club
separation, group rankings, order of play, and what organizers can change afterwards. Each
section names the source file, so this document can be checked against the code.

References like **GCR 11.7.1** point to the BWF General Competition Regulations, and **Law 7**
points to the BWF Laws of Badminton, as cited in the code. They describe the rule each part
follows. Check them against the current BWF texts before relying on this for sanctioned
events. Where the app follows club-tournament practice instead of BWF, it says so, and the
differences are collected in [Differences from BWF and open questions](#differences-from-bwf-and-open-questions).

## Contents

1. [Scoring](#1-scoring)
2. [Results](#2-results)
3. [Entries and eligibility](#3-entries-and-eligibility)
4. [Draw formats](#4-draw-formats)
5. [Seeding and byes](#5-seeding-and-byes)
6. [First-round pairing](#6-first-round-pairing)
7. [Keeping clubmates apart](#7-keeping-clubmates-apart)
8. [Group rankings](#8-group-rankings)
9. [Progression through the draw](#9-progression-through-the-draw)
10. [Match numbers and order of play](#10-match-numbers-and-order-of-play)
11. [Live scoring](#11-live-scoring)
12. [Changing a draw after publishing](#12-changing-a-draw-after-publishing)
13. [Resets](#13-resets)
14. [Tournament stages and staff roles](#14-tournament-stages-and-staff-roles)
15. [Differences from BWF and open questions](#differences-from-bwf-and-open-questions)

---

## 1. Scoring

Source: `src/engine/rules.ts` (BWF Laws 7, 8 and 16, plus common club formats).

### Scoring formats

| Format         | Games      | Points to win | Deuce / cap                                    | Interval at |
| -------------- | ---------- | ------------- | ---------------------------------------------- | ----------- |
| BWF 3×21       | best of 3  | 21            | At 20-all a 2-point lead wins; at 29-all the 30th point wins | 11 |
| BWF 3×15       | best of 3  | 15            | At 14-all a 2-point lead wins; at 20-all the 21st point wins | 8  |
| 1 game to 21   | 1          | 21            | Deuce from 20-all, cap 30                      | 11          |
| 1 game to 15   | 1          | 15            | Deuce from 14-all, cap 21                      | 8           |
| 1 game to 30   | 1          | 30            | No deuce: first to 30 wins                     | 15          |
| 1 game to 31   | 1          | 31            | No deuce: first to 31 wins                     | 16          |
| 1 game to 11   | 1          | 11            | Deuce from 10-all, cap 15                      | 6           |

- The default for new tournaments is BWF 3×21. Tournaments starting on or after **4 January 2027**
  default to BWF 3×15 (the code records this as the date BWF switches to 3×15).
- **Each player's first match in a shorter format.** An event can play every player's first match
  in another format and the rest in the main one. Iowa Open Test 26 uses one game to 30 for each
  player's first match, then best of 3 to 21.
  - Knockout and drop flight: a match uses the first-match format when either player hasn't played
    in the event yet. A player who had a bye in round 1 plays their first real match (usually round 2)
    in it, even when their opponent has already played. Players who drop to a lower flight or the
    plate have already played, so those matches use the main format, and so does the 3rd-place match.
  - Round robin: every group match uses the opening format; the knockout after the groups uses the
    main format.

### When a game score is valid

For a format with points-to-win **P** and cap **C**:

- Scores are whole numbers, 0 or more, and no game goes past C.
- **No-deuce formats** (C = P, e.g. one game to 30): the game ends when one side reaches P.
  A tie at P (e.g. 30-30) is impossible.
- **Deuce formats:**
  - P against P−2 or less finishes the game (21-19, 21-5).
  - P against P−1 (21-20) is still in play.
  - Past P−1-all, the game ends at a 2-point lead (24-22). A gap of 3 or more there (25-22) is impossible.
  - At the cap, a 1- or 2-point lead finishes the game (30-29, 30-28).
- If a score is impossible, the app explains why. For 21-20 it suggests "Did you mean 22-20?".

### When a match result is valid

- Every entered game must be a finished, valid game.
- The match must be decided: one side has won ⌈games ÷ 2⌉ games (2 of 3, or 1 of 1).
- No game may be entered after the match was already decided.
- Quick entry accepts "21-15 18-21 21:19" (hyphen, dash, colon or slash between scores).

## 2. Results

Source: `src/engine/rules.ts` (`checkMatch`), `src/data/ops.ts` (`saveResult`).

| Result           | What's needed                                                        |
| ---------------- | -------------------------------------------------------------------- |
| Normal           | Valid, decided games (see above)                                     |
| Retired          | Who retired; that side loses. The last game may be unfinished. If the match was already decided, it's a normal result instead. |
| Walkover         | The winner. Game scores are optional.                                |
| Disqualified     | The winner. The last game may be unfinished.                         |

- A result can only be saved once both sides are known (no result against a bye).
- **Correcting a result.** Scores can be changed at any time. Changing the **winner** is refused
  once a later match that uses this result has started; that match is named in the message.
- **Undo.** The last change to a match can be undone, with the same check.

## 3. Entries and eligibility

Sources: `src/data/eligibility.ts`, `src/features/public/register/registrationTypes.ts`,
`src/features/admin/entries/AddEntryDialog.tsx`.

### Who may enter

| Event                   | Who                       |
| ----------------------- | ------------------------- |
| Men's singles / doubles | Men                       |
| Women's singles / doubles | Women                   |
| Mixed doubles           | One man and one woman     |

- **Age (GCR 8).** Age is the age reached in the tournament's calendar year (tournament year − birth year).
  - An "Under N" event accepts players who are under N for the whole year (age reached < N).
  - An "N+" event accepts players who reach N that year.

### Registering

- **Required about the player:** full name (2+ letters), a valid email, which events they play
  in (men's or women's), birth year, and club. "No club" is a valid choice for club.
- **Required for each event entered:** the player's own skill level for that event. Singles and
  doubles levels can differ.
- **Doubles:** either name a partner (their name and skill level are required; their email is
  optional but must be valid if given) or choose "find me a partner".
- Entries made by players start as **To confirm**. The organizer confirms them, one by one or all at once.
- Entries added by an organizer are confirmed straight away. An organizer may override three
  warnings, after seeing them: eligibility (gender or age), a full event, and closed registration.

### Skill levels

| Level | Name         | Meaning                              |
| ----- | ------------ | ------------------------------------ |
| A     | Advanced     | Tournament regular, strong all round |
| B     | Competitive  | League or club matches every week    |
| C     | Intermediate | Plays regularly, holds long rallies  |
| D     | Beginner     | New to the game or to competing      |

- For draws, A = 4, B = 3, C = 2, D = 1. A doubles pair's strength is the average of the two
  players' levels for that event. A named partner who hasn't signed up counts with the level given.
- Organizers can correct a level given at registration (Entries page). The correction applies to
  that event only; the player's levels in other events are untouched. If the draw is already
  published, the app says to redo it for the new level to count.

## 4. Draw formats

Source: `src/engine/draws.ts`.

### Knockout

- Lose once and you are out. The draw size is the next power of 2 (minimum 2); empty lines are byes.
- **Plate (optional):** a second knockout for players who lost a real match in round 1. Players who had a bye can't drop
  into it. It needs at least 2 such players.
- **3rd-place match (optional):** the two losing semi-finalists. It isn't made if a semi-final is a bye.
- Every entry without a bye plays at least **1 match**, or **2 with a plate**.

### Drop flight

Everyone starts in flight A. Each flight crowns its own champion.

| Variant | Who drops where                                                                 | Guaranteed matches |
| ------- | ------------------------------------------------------------------------------- | ------------------ |
| A/B/C/D | Lose in A round 1 → C · lose in A round 2 → B · lose in C round 1 → D          | 3                  |
| A/B     | Lose in A round 1 → B                                                           | 2                  |
| By results (placement) | Round 1: top half v bottom half. Round 2: winners v winners, losers v losers. Then: upper winners → A, upper losers → B, lower winners → C, lower losers → D | 3 for most |

- Lower flights are built only from losers of **real** matches. A bye never leaves an empty place
  further down, but a player with a bye in A has one fewer guaranteed match.
- Losers fill a lower flight in the standard seed positions, in the order of the matches they
  came from. Neighbours are spread apart and any byes fall in the standard places.
- **By results (placement rounds)** is the default for new events. The first two rounds are placement rounds, not
  elimination: they sort everyone into a flight by results, and the level only decides who plays whom.
  1. The ranking is the **Seeding order** list exactly as the organizer leaves it (by default: seeds, then level
     A → D). With "Random draw" pairing, everyone after the seeds is ordered by lot.
  2. Round 1: top half v bottom half by count, never two from the same half. The Pairing setting picks who meets
     whom: **Close levels** 1 v N/2+1, 2 v N/2+2 … (A v C, B v D with equal level counts) or **Ranked order**
     1 v N, 2 v N−1 … (A v D, B v C: the B/C borderline is decided head to head).
     With an odd number the top-ranked player gets a bye (counted as a win).
  3. Round 2 is fixed when the draw is published: round-1 winners (upper group) and losers (lower group) are
     each paired the same way as round 1 (A v B upper, C v D lower when results go to form). Each group is
     ordered by the expected player's own place in the seeding order: the upper group by each round-1 match's
     better-ranked player, the lower group by its lower-ranked player. So with Ranked order (A1 v D12 …) the D
     losers are at the bottom of the lower group, not the top. The **best-ranked players in each group get byes**
     here (e.g. A1–A8 and C1–C8, never a D), as many as make both resulting flights clean
     knockout sizes (24 → 8 byes + 8 matches → flights of 16 and 8), at most half the group. Round 2 never mixes
     winners and losers of round 1.
  4. Upper round-2 winners → Flight A, losers → B; lower winners → C, losers → D. Each flight is a seeded
     knockout, and its rounds are named **Round 1, Round 2 … Semi-final, Final**.
  - **Nobody is knocked out before their third game.** Games 1 and 2 only place you; game 3 (flight Round 1) is the
    first one you can go out in (a bye counts as a game).
  - **Byes always go to the top of the seeding order. The "Byes" setting picks where:**
    - **Placement round 1** (default): the top players skip round 1, as many as make every flight a clean knockout
      (48 entries → 16 byes; flights of 16, 16, 8, 8). Round 1 is then played by the rest of the list, so lower
      levels can meet each other there (12 per level: B v C ×4, B v D ×4, C v D ×8).
    - **Placement round 2**: everyone plays round 1; the best of each round-2 group skip round 2 (see 3; flights of
      16, 8, 16, 8).
    - **In the flights**: everyone plays both placement rounds; each flight's Round 1 has the byes (flights of 12,
      4 byes each, one level per flight).
  - An odd field always gives the top seed a round-1 bye. When the numbers can't be made clean (e.g. 33 entries) a
    flight's **Round 1** gets a few byes too; never a later round. Nobody gets more than one bye.
  - **Upsets:** results decide. A D player who beats a B player in round 1 takes the B player's place in the upper
    group (and its round-2 match); the B player takes theirs in the lower group. Nobody is moved back.
  - **The draw never changes after publishing.** Round-2 opponents are known slots ("winner of #12"), filled as
    results come in. Because of this, after an upset the round-2 pairs are the published ones, not re-sorted.
  - Clubmates are kept apart in round 1 where possible.
  - Layout: round 1 and round 2 matches sit in standard seed positions (seed 1 at the top, seed 2 at the bottom,
    3–4 in the other quarters). The Placement tab shows round 1, then round 2 upper and lower with the players who go
    straight into Flight A or C.
  - With fewer than 4 entries the event is one A/B drop flight and the draw says why.
- A/B/C/D needs at least 4 real first-round matches and a draw of 8 or more. Otherwise the draw
  uses A/B and says why.

### Round robin

- **Number of groups:** enough to keep groups at the chosen size (3–6), without leaving a group
  of only 1 or 2 players.
- **Filling the groups (snake order):** entries are ranked (seeds first, then by level, ties by
  lot), then dealt like a snake: 1 → A, 2 → B, 3 → B, 4 → A, … so every group gets an even mix.
  With "Random draw" pairing, unseeded entries are ordered by lot instead of by level.
- **Order of matches:** circle-method rotation; for a group of 4 this is the BWF-recommended order.
  **Players from the same club play each other first (GCR 16.5).**
- Clubmates go to different groups where a swap with an entry of the same strength allows it
  (see [section 7](#7-keeping-clubmates-apart)).
- **After the groups (optional):** the top 1 or top 2 of each group go into a knockout.
  - Group winners take the seed positions.
  - Byes go to the group winners, in seed order.
  - With top 2, each runner-up is placed in the opposite half from their own group's winner,
    as far away as possible.
- Every player plays every match in their group.

## 5. Seeding and byes

Source: `src/engine/draws.ts` (GCR 11.4–11.11).

### How many seeds (GCR 11.7.1)

| Entries | Seeds suggested |
| ------- | --------------- |
| 64+     | 16              |
| 32–63   | 8               |
| 16–31   | 4               |
| fewer   | 2               |

- Round robin suggests one seed per group. The organizer can choose any number from 0 up to the number of entries.
- The organizer sets the seeding order (drag or arrows), or uses "Sort by level". The top N are the seeds.

### Where seeds go (GCR 11.8.3, 11.10)

- Seed 1 is at the top of the draw and seed 2 at the bottom. Seeds 3–4 go in the remaining
  quarters and 5–8 in the remaining eighths. Seeds in the top half sit at the top of their
  section, and seeds in the bottom half at the bottom.
- **Drawn by lot within groups:** seeds 3–4 are drawn by lot between their two positions, then
  5–8 among theirs, then 9–16.

### Byes

- Byes go to the seeds in seed order, then to the next seed positions. This spreads byes evenly
  through the draw.
- In level-based pairing (section 6) byes go to the top-ranked entries, with one exception: if more than half
  of the entries left to play round 1 are the same level, a few of them swap with the lowest-ranked unseeded
  bye-holders of other levels, so round 1 isn't level against same level. Seeds always keep their byes, and a
  swap is skipped if it would make keeping clubmates apart impossible.

## 6. First-round pairing

Source: `src/engine/pairing.ts`. Level-based pairing is a club-tournament practice, not a BWF rule.

The organizer picks one of three:

| Option           | What happens in round 1                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| **Close levels** (default) | Players meet someone near their level: A plays C, B plays D.                         |
| **Ranked order** | The classic bracket: the top-ranked unseeded player meets the lowest-ranked (A plays D).       |
| **Random draw**  | Unseeded players are drawn by lot, as in BWF draws. Levels are ignored.                        |

For Close levels and Ranked order:

1. Rank every entry: seeds first (in the organizer's order), then by level A → D. Ties within a level are drawn by lot.
2. The top-ranked get the byes (but see Byes in section 5: when round 1 would be mostly one level, a few
   lower-ranked unseeded entries of other levels play round 1 instead).
3. Split everyone else into a top half and a bottom half and pair them in order:
   - Close levels: top 1 v bottom 1, top 2 v bottom 2, …
   - Ranked order: top 1 v bottom last, top 2 v bottom second-last, …
   When clubmates would meet, the swap that fixes it avoids creating a same-level pair if it can.
4. Pairs are placed on the seed positions in rank order, so the strongest pairs land in
   different halves and quarters, just like seeds. Pairs of equal standing are placed by lot.

Uneven numbers just mean more byes. An uneven mix of levels shifts which levels meet, but the
ranking is always respected.

## 7. Keeping clubmates apart

Sources: `src/data/clubs.ts`, `src/engine/clubSpread.ts`, `src/engine/pairing.ts`,
`src/engine/draws.ts`. Follows GCR 11.11 (separation), applied to clubs.

### Who counts as clubmates

- Two entries are clubmates only if they share a **real** club name.
- **"No club" (or a blank club) is never a club.** Two players without a club are never clubmates.
- A doubles pair counts as the club its players share; a partner without a club is ignored. A pair
  from two different clubs counts as neither.

### What the draw does

1. **Round 1.** The pairing step (section 6) and the BWF draw by lot both swap players to avoid
   clubmates meeting in round 1 where possible.
2. **Spreading through the whole draw.** Clubmates are then spread so they meet **as late as possible**:
   - 2 from one club go into different halves, so they can only meet in the final;
   - 3–4 go into different quarters, 5–8 into different eighths, and so on;
   - if a club has more players than the draw has sections, the earliest meetings are pushed as
     late as the numbers allow. A round-1 meeting counts as worse than any number of later meetings.
3. **What the spreading may change, so the draw isn't manipulated:**
   - seeds never move;
   - byes stay on the same lines;
   - only two **unseeded** entries of the **same skill level** trade places, so every round-1
     match-up by level stays exactly as drawn;
   - with Random draw, any two unseeded entries may trade places, which is still a draw by lot;
   - results are never involved: this happens only while the draw is made.
4. **Round-robin groups.** Clubmates are moved to different groups by swapping with an entry in
   the same position of the snake (the same strength), where that is possible.
5. **Drop flight.** The spreading applies to flight A. Lower flights are filled by results.
6. **What the organizer sees.** Normally nothing. A note appears only when clubmates must meet in
   round 1 (or share a group) because there's no other way, for example
   "X and Y (ISUBC) meet early: there weren't enough places to keep them apart."

## 8. Group rankings

Source: `src/engine/standings.ts` (GCR 16.2).

Players in a group are ranked by:

1. **Matches won.**
2. If **two** are tied: the result of their match against each other.
3. If **three or more** are tied: **game difference** (games won − games lost). If that leaves
   exactly two tied, their head-to-head result decides.
4. Then **point difference**. Again, if that leaves exactly two tied, their head-to-head decides.
5. Then **drawing lots**, but only once every match in the group is finished. Until then those
   players are shown as level.

- **Walkovers in the standings:** the winner is credited with a straight-games win to the
  points-to-win and nil (e.g. 21-0, 21-0). This is a common local convention.
- A tied position shows the reason it was decided (head-to-head, game difference, point
  difference, drawn by lot).

## 9. Progression through the draw

Source: `src/engine/progression.ts`.

- Every match takes its two players from a source: an entry, a bye, the winner or loser of
  another match, or a group finishing position. The app works out who plays whom from these
  sources whenever a result changes.
- A match against a bye is completed automatically and the player goes through.
- A match is **ready** once both players are known, and **waiting** until then.
- A group's finishing positions are only used once every match in the group is finished.
- A result whose winner a later match already depends on can't be changed or undone while that
  later match is on court or finished.

## 10. Match numbers and order of play

Sources: `src/engine/progression.ts`, `src/engine/scheduler.ts`, `src/data/assign.ts`.

### Match numbers

- Every playable match gets a tournament-wide number when its draw is published, in a sensible
  order of play: earlier rounds first, then by stage, then by position in the draw.
- Byes get no number. Numbers never change afterwards, including when the draw is edited (section 12).

### Calling matches to courts

- All events share the courts and **take turns**. Each ready match's turn is its place in its
  event's ready list plus how many of that event's matches are already on court. Lower turns go
  first; within an event, lower match numbers go first. This stops one event's whole round from
  being played before the next event starts.
- **A player is never called while on another court.** Busy players are shown, and the organizer
  can only override after a warning.
- **Rest between matches.** Each tournament sets a minimum rest: none, 10, 15, 20, 30, 45 or 60
  minutes. Iowa Open Test 26 uses 20. A player who finished less than that ago is shown as
  resting, and calling them needs the organizer's confirmation. Walkovers don't count as a match
  played for rest.
- **Fill free courts** sends the next ready match to every free court in call order. It never
  calls a busy player and skips resting ones. Players are notified the same way as for a manual call.

## 11. Live scoring

Source: `src/data/ops.ts` (`adjustLive`, `setLivePoints`).

- Only matches on court take live scores. Points can be added with +/−, or typed (0 up to the cap).
- When a game is finished (by the rules in section 1), it is recorded and the next game starts at 0–0.
- −1 at 0–0 steps back into the previous game.
- Once the match is decided, live scoring stops and the organizer confirms the result.
- **Reset score** (after confirmation) puts the live score back to 0–0; the match stays on court.

## 12. Changing a draw after publishing

Source: `src/data/placements.ts`, `src/features/admin/draws/DrawEditor.tsx`. Organizers with
draw rights only.

- **What can move:** the starting places, meaning the first-round lines of a knockout or A flight, or
  the seats in round-robin groups. Later rounds follow from results.
- **Who is locked:** players who have played or are on court in that event stay where they are.
- **How:** editing happens on the bracket itself. Tap a player and confirm to take them out; a
  holding tray pops up at the bottom of the screen. Put them back in an open place with its
  dropdown, or drag on a computer. Dropping a player onto someone swaps them. Every step asks for
  confirmation. Once everyone is placed, the later rounds preview the new placements before you publish.
  Round-robin groups are edited the same way, seat by seat.
- **Before publishing the changes:**
  - everyone must be placed again (the holding area must be empty);
  - each player can be in only one place.
- **Moving byes.** Until any match in the event has been played (or has a score), a player can
  also be put against someone who has a bye. That bye becomes a real match, and any place left
  empty becomes a bye. Once play has started, byes stay where they are.
- **What publishing keeps:**
  - Without moving byes, every match and its number stays the same; the app works out who plays
    whom again from the new places.
  - When byes move, the knockout or drop-flight structure is rebuilt from the new first-round lines,
    so lower flights and the plate take only losers of real matches. Matches are renumbered within
    the event's existing numbers when they fit, otherwise from the next free number. The summary
    says to reprint score slips, and warns if a line ends up with nobody in it (its round-2
    opponent then goes straight through).
  - Players in the event are notified that the draw changed.
- **Saving without publishing.** "Save changes" keeps the edits with the tournament (even with
  someone still in the holding area), so they can be finished and published later. Players see
  nothing until publishing. The draw page and the tournament home show that saved changes are
  waiting. Saved changes record who saved them and when, and only staff who can make draws can see
  them. They are cleared when they are published or discarded, or when the draw is reset or made
  again. Edits not saved yet are also kept on the device being used, so a reload loses nothing.
- The confirmation for each move warns when the new place puts two clubmates together.
- Adding a late entry or removing a withdrawn one isn't an edit. That needs the event's draw to be made again.

## 13. Resets

Sources: `src/data/resets.ts` and the screens that use it. Every reset asks for confirmation and
says what will be lost.

| Reset                       | Where                         | What happens                                                                |
| --------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| Reset score                 | Court card                    | Live score back to 0–0; the match stays on court                            |
| Reset result                | Score form of a finished match | Back to not played. Refused if a later match depending on it has started. Can be undone. |
| Clear results (one event)   | Draw page                     | Every match of the event back to not played; the draw and numbers stay      |
| Reset draw (one event)      | Draw page, tournament home    | Draw and its results removed; entries stay                                  |
| Clear all results           | Settings                      | Every result cleared, draws stay; the tournament goes back to the draws stage |
| Reset to registration       | Settings, simulator           | Every draw and result removed, registration reopens, entries stay, match numbers restart at 1 |
| Reset demo data             | Settings (demo only)          | Everything back to the starting demo                                        |

## 14. Tournament stages and staff roles

Sources: `src/data/store.ts` (`setStage`), `src/auth/permissions.ts`.

### Stages

Draft → **Registration** (open) → **Draws** (registration closed) → **Match day** (live) → **Finished**

- Players get an announcement at each stage change.
- **Closing registration** (confirmed) freezes the entry list. Entries still waiting for
  confirmation won't be in the draws.
- **Match day** can start once at least one draw is published.
- **Finishing early** (confirmed) is possible with matches unplayed.
- A finished tournament can be reopened, and registration can be reopened while nothing is drawn.

### Staff roles

| Can…                                   | Owner | Admin | Scorer |
| -------------------------------------- | :---: | :---: | :----: |
| Run match day (courts, scores, messages, slips) | ✓ | ✓ | ✓ |
| Manage entries                          | ✓     | ✓     |        |
| Make and edit draws                     | ✓     | ✓     |        |
| Tournament settings and stages          | ✓     | ✓     |        |
| Create tournaments                      | ✓     | ✓     |        |
| Manage the team                         | ✓     |       |        |

A tournament always keeps at least one owner. Players see only their own matches and registrations.

---

## Differences from BWF and open questions

These are deliberate choices or points to confirm:

1. **Clubs instead of member associations.** BWF separates players by member association
   (country). The app applies the same idea to clubs, which is what matters at club tournaments.
2. **"No club" is not a club.** Players without a club are never kept apart from each other.
3. **Club spreading goes further than round 1.** Clubmates are spread through the whole draw
   (halves, then quarters, …), but only by swapping unseeded players of the same level, so seeds,
   byes and level match-ups are untouched.
4. **Level-based pairing** (Close levels, Ranked order) is club practice, not BWF. Choose
   **Random draw** for a pure BWF draw by lot.
5. **Walkovers in group standings** count as a straight-games win to nil. Check this against
   your tournament's regulations.
6. **One game to 30 has no deuce:** first to 30 wins, 30-29 included. This was assumed for the
   Iowa Open's first round and still needs confirming. If a 2-point lead with a cap is wanted,
   switch round 1 to "1 game to 21" (cap 30) or change the format.
7. **Rest time** is set per tournament: none, 10, 15, 20, 30, 45 or 60 minutes. The Settings page
   notes that BWF uses 60 minutes; clubs often use 20–30.
8. **BWF 3×15 from 4 January 2027** is only used as the default scoring for new tournaments that
   start on or after that date. Confirm the date against BWF's announcement.
