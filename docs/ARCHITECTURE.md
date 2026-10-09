# Architecture

## Layers

Code depends downwards only. ESLint enforces the two rules that matter most (see `eslint.config.js`).

```
app/          router, routes, root layout, error screen          ← may import anything
features/     one folder per screen or flow (public/, admin/)     ← may import components, data, lib, engine
components/   reusable UI: ui/ primitives + domain components     ← must NOT import features/ or app/
data/         store, ops, lookup, queries, demo, toast            ← must NOT import features/ or app/
lib/ hooks/   framework-light utilities                          ← must NOT import features/ or app/
config/       constants and environment                          ← leaf
engine/       pure domain logic, no React, no app imports         ← leaf (relative imports only)
```

### engine/ — the rules of badminton

Pure, deterministic TypeScript with no React or browser APIs, so it can also run on a server
(for example a Supabase Edge Function) unchanged. It covers:

- `rules.ts`: scoring presets (BWF 3×21, 3×15, one game to 30/31/21/15/11), game and match validation, quick-score parsing.
- `draws.ts`: BWF seeding positions, byes, knockout, round robin groups, AB/ABCD drop flights fed by real losers.
- `pairing.ts`: level-balanced first rounds (A vs C, B vs D), club separation, uneven fields.
- `standings.ts`: group tables with BWF GCR 16.2 tie-breaks.
- `progression.ts`: who plays whom as results come in, match numbering, dependents.
- `scheduler.ts`: the call queue, busy players and rest time.

Most of the 1,800+ tests live here. Randomness always comes from a seeded RNG (`rng.ts`), so draws are reproducible.

### data/ — state

- `types.ts`: the shape of the database snapshot (`DB`), notices and registrations.
- `ops.ts`: **pure** state transitions `(db, …) => db | error` — call to court, save result, undo, publish a draw, live scoring.
  Every business rule that changes data goes here, with a unit test in `ops.test.ts`.
- `store.ts`: the zustand store. It holds the snapshot, persists it to `localStorage`, calls `ops`, and raises toasts and notices.
  Components read with selectors (`useStore((s) => s.matches)`) and call actions; they never mutate data themselves.
- `lookup.ts`: `useLookup()` builds indexed accessors (`lk.match(id)`, `lk.entryName(id)`, `lk.matchRules(m)`) once per data change.
- `queries.ts`: derived views shared by several screens (call queue, players of a tournament, champions).
- `toast.ts`: transient notifications; call `toast('Saved')` from anywhere.

**Moving to Supabase** (next step) replaces persistence, not the shape of the app: the store keeps the same
actions, but they call the RPCs in `supabase/migrations` (`call_match`, `record_result`) and realtime subscriptions
update the snapshot. Screens keep reading through `useLookup()` and `useStore` selectors.

### auth/ — accounts and permissions

- `authStore.ts`: the signed-in account (`useAuth`) and `authActions` (sign in/up, Google, sign out, password reset, name change).
- Two backends behind one interface (`types.ts`): `supabaseBackend.ts` (real accounts) and `demoBackend.ts` (previews; accounts in the browser).
- `useAccess()`: roles per organization and the linked player. `permissions.ts` maps roles to capabilities and mirrors the database's row level security.
- `redirects.ts`: only same-site `next` paths are followed after sign-in.

Routes use guards from `features/auth/guards.tsx` (`RequireAuth`, `RequireOrganizer`); each organizer route declares the capability it needs
(`handle: { cap }`) and the admin shell checks it against the tournament's organization. The UI only hides what the
database would refuse anyway: the database is the security boundary.

### components/

- `ui/`: design-system primitives with no domain knowledge. One component per file.
  Tokens (colors, radii, shadows, fonts, breakpoints) live in `src/styles/index.css` and `tailwind.config.js`.
- `match/`, `draw/`, `tournament/`, `notices/`, `help/`: domain components used by more than one feature.

A component file exports components only (fast refresh); helpers and constants go in a sibling `.ts` file
(e.g. `match/matchInfo.ts`, `tournament/labels.ts`).

### features/

One folder per screen. A page file (`RunTournament.tsx`) owns state and layout; sections live next to it
(`StageBar.tsx`, `DrawsStage.tsx`) with pure helpers in `.ts` files (`stages.ts`).
Code used by a single feature stays inside that feature; promote it to `components/` or `data/` when a second feature needs it.

### app/

- `routes.tsx`: the route table. Every page is lazy-loaded, so the public site never downloads the organizer desk.
- `router.ts`: picks browser, hash or memory routing from configuration.
- `RootLayout.tsx`: toasts, scroll restoration, the navigation progress bar.
- `RouteError.tsx`: the error screen. It reloads once when a deploy has replaced the code a tab was using.

## Configuration

All environment variables go through `src/config/env.ts`, which validates them at startup (`parseEnv` is unit-tested).
Only `VITE_*` variables reach the browser, so never put secrets in them. App constants (name, storage keys) live in `src/config/app.ts`.

## Errors and monitoring

`lib/monitoring.ts` is the single place errors are reported: route errors, uncaught errors and unhandled promise
rejections all go through `reportError`. Hook an error-tracking service in there.

## Testing

| Project | Where | Environment | What |
| --- | --- | --- | --- |
| unit | `src/**/*.test.ts` | node | engine, ops, config, utilities |
| ui | `src/**/*.test.tsx` | jsdom | components and a smoke test that renders every route |
| db | `supabase/tests/*.test.ts` | node + PGlite | the migration, constraints, triggers, RPCs and row level security |

## Adding a page

1. Create `src/features/<area>/<page>/<Page>.tsx` exporting the component.
2. Add a lazy route in `src/app/routes.tsx`.
3. Read data with `useLookup()` / `useStore(selector)`; change data through store actions (add an op + test if it's new logic).
4. Add the path to the list in `src/app/routes.test.tsx`.
