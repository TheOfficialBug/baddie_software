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
