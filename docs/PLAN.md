# Badminton Tournament Platform — Review & Plan (v2)

> Working name: **ShuttleDesk** (placeholder). Status: **draft for review**. Nothing is built yet.
> v1: 2026-10-08. v2: 2026-10-08.

### What changed in v2
- **Umpire / court-desk role removed.** Players record scores on paper and **the admin enters results and live score updates**. Score validation stays; rally-by-rally service tracking goes.
- **Three competition modes are first-class:** **Round Robin**, **ABCD Drop Flight**, and **Knockout** (§4).
- **UI/UX is the top priority.** There's a new design section (§5) with principles, a design system, key screen wireframes, and a **Light / Dark / System theme selector**. The roadmap now starts with a clickable design prototype.
- **New: printable score slips with a QR code** linking to each match's score-entry screen. This fits the paper-score workflow (§5.6).

---

## 1. Goal

A hosted web app for running badminton tournaments, like Pickleball.com's tournament product (formerly PickleballBrackets) but built for badminton:

- **You (admin):** create tournaments, open registration, take payments, build draws, schedule courts, and **enter scores**, both final results from the players' paper slips and optional live updates during a match.
- **Players:** find events, register (doubles with a partner), pay, and see draws, schedule, "you're up next" alerts and results.
- **Public / spectators:** follow live courts, draws, standings and results without logging in.

**Feature benchmark from Pickleball.com:** registration by level and format, waitlists, Stripe payments, round robin and elimination brackets, pool-to-bracket, seeding, court assignment, live results, and check-in.

**Where badminton differs:**
- Rally scoring with a two-point lead and a hard cap.
- A **scoring change on 4 Jan 2027**: BWF's standard moves from 3×21 to 3×15.
- BWF rules for seeding, byes and group tie-breaks.
- Mixed doubles as a core event.
- The A/B/C/D flight culture in club tournaments.

---

## 2. Rules: researched, then encoded (not scraped at runtime)
The rules change rarely and on announced dates, so they live in **versioned rule presets in code**, each citing its source clause. Runtime scraping would be fragile: BWF blocks automated fetching, and the regulations are copyrighted PDFs. When BWF changes a rule, we add a new preset version, and old tournaments keep the rules they were played under.

---

## 3. Badminton rules the system must encode

### 3.1 Scoring systems (Laws 7, 8, 16)

| | **3×21 (BWF standard until 3 Jan 2027)** | **3×15 (BWF standard from 4 Jan 2027)** |
|---|---|---|
| Match | Best of 3 games | Best of 3 games |
| Game to | 21 | 15 |
| Deuce | At 20-all, need a 2-point lead | At 14-all, need a 2-point lead |
| Cap | 29-all → 30th point wins | 20-all → 21st point wins |
| Interval / change ends in game 3 | When the leader reaches 11 | When the leader reaches 8 |

- 3×21 remains an approved alternate, and domestic organizers may use approved alternates.
- **Club presets:** 1×21, 1×15, 1×11, 1×31 (common in recreational flights), 5×11, and custom (points, cap, number of games).
- **New tournaments default by date.** Starting on or after 2027-01-04 → 3×15, otherwise 3×21. You can override this per event. Each match stores a snapshot of its rules.

### 3.2 Score validation (what the admin entry form checks)
These checks catch typos from paper slips:

- **Completed game:** the winner reached the target with a 2-point lead, **or** won at the cap.
  - 3×21 valid: 21-19, 22-20, 30-29.
  - 3×21 invalid: 21-20, 23-20, 31-29.
  - 3×15 valid: 15-13, 16-14, 21-20.
  - 3×15 invalid: 15-14, 22-20.
- **Completed match:** one side won the required games (2 of 3), and no games were entered after the match was decided.
- **Live (in-progress) score:** the numbers must be reachable. Nobody can be past the cap, and a game the form treats as finished must be a valid finished game.
- **Special results:**
  - **Retired:** the score at the moment of retirement plus "Ret."
  - **Walkover:** "W/O", with no score.
  - **Disqualified:** "DQ".
  - Optionally, local rules can record a walkover as 21-0, 21-0.
- **Soft warnings, not hard blocks.** You can override with a reason, which is logged, because local events sometimes play to odd rules.

### 3.3 Events and eligibility
- **Standard events:** Men's Singles (MS), Women's Singles (WS), Men's Doubles (MD), Women's Doubles (WD), Mixed Doubles (XD).
- **Age groups:**
  - Juniors: U11 to U19, by age throughout the calendar year (GCR 8.1).
  - Masters: 35+, 40+, … in 5-year steps (GCR 8.2).
- **Level divisions:** A+, A, B, C, D, or Open / Intermediate / Beginner.
- **Custom divisions:** fully configurable. Set a gender rule (men, women, mixed or open), an age rule, a level rule, and an entry cap.
- A player can enter several events, and the scheduler accounts for that.

### 3.4 Draw and standings rules (BWF General Competition Regulations)
I parsed the March 2020 GCR, so clause numbers need re-checking against the current edition before launch.

**Knockout**
- Draw size is the next power of 2. **Byes = draw size − entries**, all in round 1 (11.4).
- Byes go to the top seeds first.

**Seeds (11.7)**

| Entries | Seeds |
|---|---|
| 64 or more | 16 |
| 32–63 | 8 |
| 16–31 | 4 |
| Fewer than 16 | 2 |

**Seed placement (11.8–11.10)**
- Seed 1 at the top, seed 2 at the bottom.
- Seeds 3–4 drawn by lot into the remaining quarters, 5–8 into the remaining eighths, 9–16 into the remaining sixteenths.

**Separation (11.11):** players from the same club avoid each other in round 1 wherever possible.

**Group ranking (16.2), applied in order**
1. Matches won.
2. If 2 tied: head-to-head.
3. If 3 or more tied: game difference. If that leaves 2 tied: head-to-head.
4. Then point difference. If that leaves 2 tied: head-to-head.
5. If still tied: drawing lots. The app records a seeded random draw.

**Incomplete group play (16.2.5):** if a player or pair can't finish all their group matches, delete all their group results. A retirement counts as not finishing. Make this a toggle: many club events prefer to keep the results.

**Group match order and same-club play**
- Recommended order for a group of 4 (16.4): 1v4, 2v3, 1v3, 2v4, 3v4, 1v2. Tables for 3, 5 and 6 exist too.
- Same-club pairs play each other first (16.5).

**Rest between matches:** the BWF minimum is 60 minutes (11.3). Make it configurable, since clubs often use 20–30.

---

## 4. Competition modes

All three modes use the same building blocks: **Stages** (a draw or group) containing **Matches**, plus **progression links** ("winner → slot", "loser → slot in another flight", "group #1 → knockout slot 1"). Modes can be **chained**, e.g. Round Robin groups → Knockout.

### 4.1 Round Robin
- **Single group:** everyone plays everyone. Best for 3–6 entries.
- **Multiple groups:** snake-seeded so group strengths are balanced, with configurable group size (3–6) and recommended BWF match order.
- **Advance to knockout (optional):** the top N from each group go to a knockout or to flights, and group winners and runners-up are placed so they meet as late as possible.
- **Standings:** shows wins/losses, game difference and point difference, and explains each tie-break ("Ranked above Lee: head-to-head").
- **Points table option:** some clubs use 2 points for a win and 1 for a loss. This is configurable, with BWF order as the default.

### 4.2 ABCD Drop Flight (triple elimination)
A common US club format. **Everyone starts in the A draw, and losing drops you to a lower flight instead of sending you home.**

```
           ┌── lose Round 1 ─────▶ C flight ── lose C Round 1 ──▶ D flight
A flight ──┤
           └── lose Round 2 ─────▶ B flight
           (lose Round 3+ → out, or → optional A-consolation)
```

| Flight | Who plays in it | Size, with N entries in A (power of 2) |
|---|---|---|
| **A** | Everyone | N |
| **B** | A round-2 losers | N/4 |
| **C** | A round-1 losers | N/2 |
| **D** | C round-1 losers | N/4 |

- **Every entry is guaranteed 3 matches.** Total matches = 2N − 4. For example, 32 entries → 60 matches.
- Each flight produces its own champion and finalist (A, B, C and D winners).

**Variants (chosen per event)**
- **A/B** (double elimination): A round-1 losers go to B. Guarantees 2 matches.
- **A/B/C/D** (default above). Guarantees 3 matches.
- **AB + CD:** two separate starting draws, split by level, each with a drop flight. Guarantees 2 matches.
- **A-consolation (optional):** A round-3 and quarter-final losers drop into an A-consolation draw. One published US open uses this.
- **Custom drop map:** an advanced editor for "loser of {flight, round} → {flight, round}".

**Drop-in placement:** losers enter pre-defined slots in the lower flight using a crossover pattern, so players who met early, or came from the same quarter, don't meet again immediately. Slots are fixed when the draw is generated, so the whole structure is visible from the start.

**Byes:** see decision 1 in §10. The recommended default is that **a bye counts as a round-1 win**. A player with a bye who loses in round 2 goes to B, which keeps the draws deterministic. The trade-off is that this player is guaranteed 2 matches instead of 3. The alternative is that "losing your first *played* match" sends you to C.

**Integrity:** dropping down creates an incentive to lose on purpose ("sandbagging"). Add an admin "flag / warn / DQ" action and a player-history view (past flight finishes) to support the event's policy.

### 4.3 Knockout
- **Single elimination** with BWF seeding, byes and club separation. Optional 3rd/4th-place match.
- **Seeding sources:** manual order, imported ranking (CSV), or our rating (later phase).
- **Optional consolation (plate):** round-1 losers play a separate plate draw. This is effectively the A/B drop variant, offered in knockout setup as a simple toggle.

### 4.4 Later (not in MVP)
Team ties (Thomas/Uber/Sudirman style), double elimination with a true final, Swiss, leagues and box leagues, and social rotating-partner formats.

---

## 5. UI/UX (top priority)

### 5.1 Principles
1. **Glanceable:** any screen answers "what's happening now?" within 2 seconds. Live and next matches are always at the top.
2. **Fast for the admin:** entering a score from a paper slip takes **under 10 seconds** and **no more than 3 interactions**. Every admin screen is keyboard-friendly.
3. **Mobile-first for players and spectators:** most visitors are on phones in a sports hall. Big tap targets, a thumb-reachable nav, and no pinch-zoom needed to read a bracket.
4. **Forgiving:** undo on every score entry (a 10-second toast plus history), drafts for draws, confirmation only for destructive actions, never a dead end.
5. **Calm, then lively:** a clean neutral base with energy reserved for live moments (a score tick, a pulsing LIVE dot, a winner advancing in the bracket).
6. **Accessible by default:** WCAG 2.2 AA in **both** themes, never color-only meaning, screen-reader live regions for scores, and respect for reduced motion.
7. **Fast to load:** public pages are server-rendered, with a target of under 2 s Largest Contentful Paint (LCP) on 4G, and skeletons instead of spinners.

### 5.2 Theme selector: Light / Dark / System
- **Control:** a 3-way segmented control (☀ Light · ☾ Dark · 🖥 System) in the header menu and on the profile page. A keyboard shortcut toggles it.
- **Default:** System, which follows the OS `prefers-color-scheme` and updates live when the OS switches.
- **Persistence:** stored in `localStorage`, and in the user's profile when logged in, so it follows them across devices.
- **No flash of the wrong theme on load:** the theme is applied before first paint by a small inline script (`next-themes`).
- **Both themes designed, not inverted.** Each one has its own token set: surface, elevated surface, text, muted text, border, accent, live, success, warning and danger. Both are contrast-checked.
- **Exceptions:** brackets, charts and status colors use theme-aware tokens. **TV/projector mode** defaults to dark (better in halls) but can be overridden. **Print** (draws, schedules, score slips) is always light.

### 5.3 Design system
- **Base:** Tailwind CSS + shadcn/ui (Radix primitives, so accessibility comes built in). Icons from Lucide.
- **Typography:** Inter or Geist. **Tabular numerals** for every score and time, so digits don't shift as they change. Scores use a large display size on the court and TV views.
- **Color, proposed:**
  - A **court-green / teal accent** for primary actions.
  - A **live red** dot for in-progress matches.
  - Neutral slate surfaces.
  - Status colors for scheduled, called, live, finished and walkover/retired.
- **Event identification:** a small labelled chip (MS, WS, MD, WD, XD) plus an icon, with color as a secondary cue.
- **Flight identification:** A, B, C and D badges with distinct shapes or labels, not just colors.
- **Spacing and sizing:** an 8-pt grid, radius 8–12 px, minimal elevation (borders over shadows in dark mode), and touch targets of at least 44 px.
- **Motion:**
  - 150–250 ms ease-out.
  - Score digits roll on change, and a winner's name slides into the next bracket slot.
  - Reduced motion means instant changes.
- **Components:**
  - Match card in 3 densities: compact (bracket), standard (lists) and hero (live / TV).
  - Bracket tree.
  - Group table and cross-table matrix.
  - Court card, status pill, player chip, score input, timeline.
  - Empty states with a next action.

### 5.4 Information architecture
```
PUBLIC (no login)                    PLAYER (logged in)          ADMIN
/                 discover events    /me        my tournaments   /admin               all tournaments
/t/{slug}         tournament home    /me/matches my schedule     /admin/t/{id}        control center (match day)
/t/{slug}/live    live courts board  /me/profile profile, theme  /admin/t/{id}/setup  details, courts, events
/t/{slug}/events/{e}  draw / groups / flights                    /admin/t/{id}/entries registrations, pairs, waitlist
/t/{slug}/schedule    order of play                              /admin/t/{id}/draws  seed → generate → publish
/t/{slug}/players/{p} player's matches & path                    /admin/t/{id}/schedule courts × time grid
/t/{slug}/tv          projector mode                             /admin/t/{id}/results score entry queue
/register/{slug}      registration wizard                        /admin/t/{id}/print  slips, draws, schedule
```

### 5.5 Key screens (wireframes)

**A. Tournament home (public, mobile)**
```
┌───────────────────────────────┐
│ ◀  Fall Open 2026     ☾  ≡   │
│ Oct 24–25 · Ames Rec Center   │
├───────────────────────────────┤
│ ● LIVE NOW            see all ▶│
│ ┌──────────┐ ┌──────────┐     │  ← horizontal swipe
│ │Ct 3 · XD A│ │Ct 5 · MS C│    │
│ │Lee/Park 21│ │Rao      12│    │
│ │Kim/Cho  18│ │Diaz     15│    │
│ │ Game 2    │ │ Game 1    │    │
│ └──────────┘ └──────────┘     │
├───────────────────────────────┤
│ UP NEXT                        │
│ Ct 1  MD B · R2   Wu/Ng v ...  │
├───────────────────────────────┤
│ EVENTS                         │
│ [MS] Men's Singles   32 · A–D ▶│
│ [XD] Mixed Doubles   16 · RR  ▶│
├───────────────────────────────┤
│ 🔍 Find a player               │
└───────────────────────────────┘
```

**B. Admin control center (desktop, match day)**
```
┌ Fall Open 2026 ▾ │ Control center  Entries  Draws  Schedule  Print │ ⌘K search │ ☾ │
├──────────────────────────────────────────────────────┬─────────────────────────┤
│ COURTS                                               │ READY TO CALL  (12)     │
│ ┌ Court 1 ────┐ ┌ Court 2 ────┐ ┌ Court 3 ────┐       │ ▸ #41 MS A R2  Rao v Wu │
│ │ ● LIVE 18:42│ │  ○ FREE     │ │ ◐ AWAITING  │       │   rest ok · drag→court  │
│ │ XD A QF     │ │ drop a match│ │   RESULT    │       │ ▸ #42 WD C R1 ...       │
│ │ Lee/Park 21 │ │   here      │ │ MD B R1     │       │   ⚠ Kim plays in 12 min │
│ │ Kim/Cho  18 │ │             │ │ [Enter score]│      ├─────────────────────────┤
│ │ [+1][+1][⋯] │ │             │ │             │       │ AWAITING RESULT (3)     │
│ └─────────────┘ └─────────────┘ └─────────────┘       │ #37 Ct 3 · 41 min       │
│ …                                                    │ RECENT ✓ (undo)         │
└──────────────────────────────────────────────────────┴─────────────────────────┘
```

**Control center flow**
- Drag a match onto a free court (or click **Call**). This notifies the players and prints the slip.
- The court shows **LIVE** with a timer. Use the optional **+1** buttons for live updates.
- When the slip comes back, click **Enter score**. The winner advances automatically (including drops to lower flights), the court frees up, and the next suggested match is highlighted.

**C. Score entry (modal or sheet; opened from a court card, the ⌘K search, or the slip's QR code)**
```
┌ #37 · MD B Round 1 · Court 3 ─────────────── 3×21 ┐
│                    G1    G2    G3                 │
│ Wu / Ng           [21]  [18]  [21]               │
│ Lee / Shah        [15]  [21]  [19]               │
│ ✓ Valid · Winner: Wu / Ng (2–1)                   │
│ ○ Normal  ○ Retired  ○ Walkover  ○ DQ             │
│            [ Save & next ⏎ ]   [ Cancel ]         │
└───────────────────────────────────────────────────┘
```
- **Quick type:** `21-15 18-21 21-19` in a single field is parsed into the boxes.
- **Keyboard:** Tab moves between boxes, Enter saves.
- **Feedback:** inline validation with plain-language messages ("21-20 isn't a finished game. Did you mean 22-20?").
- **Undo:** a toast for 10 seconds, plus a full edit history per match.

**D. Draw views**
- **Knockout, desktop:** full tree with connector lines, zoom/pan, and round headers that stay in place.
- **Knockout, mobile:** one round per screen. Swipe between rounds; each card shows its next-match link.
- **"Find me / follow player":** highlights that player's path through the draw.
- **Drop flight:** tabs **A · B · C · D** (with a live count), plus a **Flight map** overview diagram of where losers go. Each A match card shows a subtle hint, "Loser → C · R1 slot 3".
- **Round robin:** a standings table (with tie-break explanations) and a toggle to a **cross-table matrix**.

**E. Registration wizard (player, mobile)**
1. Choose events. Eligibility is checked live, and ineligible events are greyed out with the reason.
2. Partner: search, invite by email or link, or join the "Looking for a partner" list.
3. Review, then pay with Stripe Checkout and get a confirmation with a calendar file.

The wizard shows a progress bar, a sticky total, and saves the draft automatically.

**F. Draw builder (admin)**
Pick a mode (Round Robin / Drop Flight / Knockout) from visual cards that show a diagram and "guaranteed matches: 3".
Then:
1. Seeds list (drag to reorder, lock seeds).
2. **Generate preview.**
3. Warnings ("2 players from Ames BC meet in R1, can't be avoided").
4. Optional re-shuffle of the unseeded entries.
5. **Publish**.

Draft and published states are clearly labelled.

**G. TV / projector mode**
A full-screen grid of courts with hero-size scores, auto-paging, a dark default, and a scrolling "Up next" ticker. Its URL can be used as a streaming overlay.

### 5.6 Paper-slip workflow (fits how you run events)
- **Print slips:** when a match is called, print a score slip (4 per page, or single). It includes the match #, event, flight and round, court, players, blank game boxes and signature lines, plus a **QR code**.
- **Scan to enter:** scanning the QR with your phone's normal camera opens that match's score-entry screen (admin login required), so there's no searching.
- **Batch mode:** "Awaiting result" is a queue. Type the match # then the scores, and it moves to the next one.

### 5.7 States and polish checklist
- **Empty states:** every empty state names the next action ("No events yet → Add your first event").
- **Loading:** skeletons for brackets and tables; optimistic UI for score saves, with a "Saving… / Saved ✓ / Offline: will retry" indicator.
- **Errors:** human language, plus what to do next.
- **Live updates:** gentle, with no layout shift (fixed-width score boxes, tabular numbers).
- **Notifications:** "You're on Court 4 now" (push/SMS/email) and "Your next match is in about 20 minutes".
- **Responsive breakpoints:** 360 / 768 / 1024 / 1440. The admin is tablet-friendly at 768 or wider.

### 5.8 Design process (before writing app code)
1. **Mood and direction:** 2–3 visual directions on the key screens, in both themes. You pick one.
2. **Clickable prototype** of screens A–G with realistic fake data (a 32-player A/B/C/D draw, groups, live courts).
3. **Quick usability check:** you run a mock match day (enter 10 scores, call 5 matches), and 3–5 players try registration and finding their match on a phone. Fix what slows people down.
4. Then build, using the prototype as the visual spec.

---

## 6. Architecture

### 6.1 Stack

| Layer | Choice |
|---|---|
| App | **Next.js (App Router) + TypeScript**: server-rendered public pages (good for SEO), app UI for admin |
| UI | Tailwind, shadcn/ui (Radix), `next-themes` (theme selector), Motion (animations), TanStack Table, dnd-kit (drag-and-drop to courts) |
| DB | **PostgreSQL** (Neon or Supabase) + Drizzle ORM |
| Auth | Auth.js or Clerk (magic link + Google). Roles: owner/admin, player |
| Realtime | Supabase Realtime or Ably, so spectators see scores update in under a second, with a polling fallback |
| Payments | Stripe Checkout + Stripe Connect |
| Notifications | Resend (email), Twilio (SMS), Web Push |
| Hosting | Vercel + Neon/Supabase + Ably (managed, low-ops). Alternative: Docker on one VPS |
| QR / print | `qrcode` + print-specific CSS (A4/Letter, 4-up slips) |

### 6.2 Code layout
```
/apps/web            Next.js (public, player, admin)
/packages/rules      scoring presets + score validation + eligibility   (pure TS)
/packages/draws      knockout seeding/byes, round-robin groups, drop-flight builder (pure TS)
/packages/standings  GCR 16.2 tie-break engine (pure TS)
/packages/scheduler  court/time suggestions with rest constraints (pure TS)
/packages/ui         design tokens (light+dark), shared components
/packages/db         schema + migrations
```

### 6.3 Score updates and live data
- Every admin score change is an append-only **MatchUpdate** row (who, when, before → after), which powers undo and an audit trail. The current score is stored on the match for fast reads.
- Saving a final result runs one DB transaction: validate the result, set the winner, apply the **progression links** (winner advances, loser drops to a flight or is eliminated), recompute standings, free the court, then broadcast to `tournament:{id}` and `match:{id}`.
- **Editing a result after the next match has been played is blocked.** The admin sees which downstream matches are affected and must confirm a cascade reset.
- The admin UI saves optimistically and retries automatically if hall Wi-Fi drops.

### 6.4 Data model (first cut)
```
Organization(id, name, stripe_account)
User(id, email, name, theme_pref[light|dark|system])
Player(id, user_id?, name, gender, dob, club_id, level, rating?)
Club(id, name)                                   -- draw separation
Tournament(id, org_id, slug, name, venue, tz, start, end, status, default_rules)
Court(id, tournament_id, name, order, active)
Event(id, tournament_id, kind[MS|WS|MD|WD|XD|CUSTOM], name, eligibility_json,
      fee, cap, rules_preset, mode[round_robin|drop_flight|knockout], mode_config_json)
Entry(id, event_id, status[pending|accepted|waitlist|withdrawn], seed, club_id)
EntryPlayer(entry_id, player_id)
Stage(id, event_id, kind[group|knockout], flight_label[A|B|C|D|Plate|null], order, size)
Group(id, stage_id, name) / GroupMember(group_id, entry_id, position)
Match(id, stage_id, number, round, slot, entry_a, entry_b, status[scheduled|called|live|
      awaiting_result|finished], court_id, called_at, started_at, finished_at,
      rules_snapshot, games_json, result_type[normal|ret|wo|dq], winner_entry)
ProgressionLink(from_match, outcome[winner|loser], to_match, to_side)   -- advances AND drops
MatchUpdate(id, match_id, actor, before_json, after_json, reason, at)
Registration(id, user_id, entries[], stripe_session, status)
```

---

## 7. Testing (reliability)
- **Score validation:** table tests for every preset. Valid and invalid finished games, cap edges, special results, and live-score reachability.
- **Draws:**
  - Byes = next power of 2 − entries.
  - Seeds 1 and 2 can only meet in the final.
  - Seeds 1–4 are in separate quarters.
  - Club separation holds where possible.
  - Snapshot tests for every size from 2 to 128.
- **Drop flight:**
  - Every non-bye entry gets the guaranteed number of matches.
  - Every loser link points to a valid empty slot.
  - No immediate rematches.
  - Flight sizes match the formulas.
  - Simulate random results for all sizes: everything completes with exactly one champion per flight.
- **Standings:** every GCR 16.2 branch, including the case where a 3-way tie reduces to 2 and goes back to head-to-head.
- **Progression:** editing a result cascades correctly, or is blocked.
- **UI:**
  - Playwright end-to-end flows: register → pay (Stripe test mode) → generate draw → call match → enter score → public page updates.
  - Visual regression snapshots in **both themes**.
  - Automated axe accessibility checks.
- **Load:** 30 courts, 5,000 spectators.

---

## 8. Roadmap

**Phase 0: Design first (≈1–2 weeks)**
- Visual directions → design tokens (light and dark) → **clickable prototype** of screens A–G → usability check.
- In parallel: the pure engines (`rules`, `draws` for all 3 modes, `standings`) with full tests.

**Phase 1: MVP to run your next tournament (≈4–6 weeks)**
- Tournament and event setup, with the 5 standard events plus custom divisions.
- Registration with partner invites, Stripe, waitlist.
- **Round Robin, ABCD Drop Flight (A/B and A/B/C/D), Knockout** (with optional plate), and RR → KO chaining.
- Admin control center: courts, call match, live +1 updates, score entry with validation and undo, QR slips.
- Public pages: home, live board, draws/flights/groups, schedule, player page, TV mode.
- Theme selector, email notifications.

**Phase 2**
- SMS/push alerts, scheduler auto-suggest, A-consolation and AB+CD variants, custom drop maps.
- Player history and ratings, per-tournament branding (logo and accent color).
- Team ties, CSV import/export.

**Phase 3**
- Leagues and box leagues, Swiss, social formats.
- Multi-organizer marketplace, i18n, public API.

---

## 9. Risks
- **Drop-flight edge cases** (byes, withdrawals mid-draw, walkovers that cascade into lower flights). Mitigation: a deterministic link table, plus simulation tests.
- **Correcting results after progression:** mitigated with a cascade preview and confirmation.
- **2027 scoring switch:** presets, date-based defaults, and a clear "Scoring: 3×15" label on every event and match.
- **Clause verification:** re-check the current GCR, and the BWF seeding and bye tables in Statutes 5.3.8.
- **Scope:** the MVP is "run your next tournament end to end, beautifully". Everything else waits.

---

## 10. Decisions I need from you
1. **Drop flight and byes:** with a non-power-of-2 draw, does a bye count as a round-1 win (bye player loses in round 2 → B), or does "lose your first played match" go to C? (Recommended: bye counts as a win.)
2. **Drop-flight variants for the MVP:** A/B/C/D and A/B only, or also A-consolation and AB+CD?
3. **Round robin defaults:** strict BWF tie-breaks (including deleting a retired player's results), or club-friendly (keep results, optional 2/1 points)?
4. **Live updates:** do you want the +1 live buttons, or will you mostly enter final results (so "live" just shows "In progress · Court 3 · 18 min")?
5. **Co-admins:** just you, or should helpers be able to enter scores too?
6. **Visual direction:** any brand colors, logo or app name? Apps whose look you like?
7. **Monetization, hosting and first region** (carried over from v1).

---

## 11. Proposed next step
Build the **clickable UI prototype** (screens A–G, light and dark, theme selector working, realistic fake data for all three modes), so you can review the look and flow before any backend work. In parallel, build the draw engines for Round Robin, ABCD Drop Flight and Knockout, with tests.

---

## 12. Sources
**Scoring and Laws**
- [BWF: Key Changes Under the 3×15 Scoring System](https://bwfbadminton.com/news-single/2026/04/26/key-changes-under-the-3x15-scoring-system)
- [BWF: Members Approve 3×15](https://bwfbadminton.com/news-single/2026/04/25/bwf-members-approve-3x15-scoring-system)
- [USA Badminton: BWF Approves 3×15](https://usabadminton.org/bwf-approves-3x15-scoring-system/)
- [World Badminton: Laws of Badminton](https://worldbadminton.com/rules/)

**Regulations**
- [BWF General Competition Regulations (Mar 2020)](https://usabadminton.org/wp-content/uploads/2021/04/Section-5.1-General-Competition-Regulations-6-March-2020.pdf)
- [BWF Seeding & Byes tables (Statutes 5.3.8)](https://fedebadchile.cl/wp-content/uploads/2019/05/3.3.8-Technical-Diagrams-and-Tables-Seeding-and-Byes.compressed.pdf)
- [BWF World Tour Finals tie-break explainer](https://bwfworldtourfinals.bwfbadminton.com/news-single/2019/12/12/qualification-will-hinge-on-arithmetic/)

**Drop flight**
- [P. Teuben, "Tournament Combinatorics": A, A/B, A/B/C/D, AB+CD formats](https://pages.astro.umd.edu/~teuben/badminton/tourney/tourneyrun.pdf)
- [2026 Minnesota Badminton Open: drop flight rules, A-consolation, sandbagging policy](https://happeningnext.com/event/2026-minnesota-badminton-open-eid3a0dqfmn6u)
- [UCSD Badminton: Husky Open drop flight](https://recreation.ucsd.edu/sports-clubs-posts/28356)
- [Bay Area Open 2005: flights with consolation](https://www.worldbadminton.com/tournaments/documents/20051119_baopen.pdf)

**Benchmark**
- [Pickleball.com Operations & Technology Guide](https://pickleball.com/docs/en/article/pickleball-operations-and-technology-guide-tools-for-running-better-events)
- [PickleballBrackets manual](https://www.manula.com/manuals/pickleball-brackets/pbmanual)
