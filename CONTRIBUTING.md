# Contributing

## Before you push

```bash
npm run check
```

This is what CI runs. `npm run lint:fix` and `npm run format` fix most issues automatically.
In VS Code, install the recommended extensions (`.vscode/extensions.json`): files are formatted and import order is fixed on save.

## Conventions

**Structure**

- Follow the layers in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Shared code (`components/`, `data/`, `lib/`) never imports from `features/` or `app/`; `engine/` imports nothing outside itself.
- One React component per file in `components/ui/`. A file that exports components exports only components; put helpers, constants and hooks in a `.ts` file next to it.
- Keep code with the feature that uses it. Move it to `components/` or `data/` when a second feature needs it.

**Code**

- Import with the `@/` alias (`@/components/ui/Button`), except inside `engine/`, which uses relative imports so it stays portable.
- TypeScript is strict. Use `import type` for types. Avoid `any` and non-null assertions where a check reads just as well.
- Business rules go in `engine/` (badminton logic) or `data/ops.ts` (state changes) as pure functions with tests, not in components.
- Read data with `useLookup()` and `useStore((s) => s.x)` selectors. Don't call `useStore()` without a selector: it re-renders on every change.
- Read configuration from `@/config/env` and `@/config/app`, never `import.meta.env` directly.
- Report unexpected errors with `reportError` from `@/lib/monitoring`.

**UI**

- Use the design tokens (`bg-surface`, `text-muted`, `border-line`, …) instead of raw colors, so light and dark themes both work.
- Use icons from `components/ui/Icon.tsx`. Add new ones to its curated map.
- Every screen must work from 320px phones to 1920px TVs. Breakpoints (`tailwind.config.js`): `2xs` 350 · `xs` 380 · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536 · `3xl` 1920, plus `short` (landscape phones) and `touch` (touch screens).
- Tap targets are at least 44px on touch screens: use `touch:min-h-11` on compact controls, or the `tap-target` class to enlarge the hit area of a small icon button without changing its look.
- Responsive grids need a shrinkable base column (`grid-cols-1`, or `minmax(0,…)` tracks), otherwise a wide child (like a sideways-scrolling chip row) stretches the page on phones.
- Unsaved work (draw setups, score slips, messages, forms) uses `usePersistentState` with a key that names what it belongs to (`draw:${eventId}`, `score:${matchId}`), so switching events, pages or tabs never loses it; call its `clear()` once the work is saved. Screen choices such as the event filter use it too.
- Required fields: mark them with `<Field required>` and validate before moving on; show errors only after the user tries to continue.
- Interactive elements need accessible names, keyboard support and 44px touch targets. ESLint's `jsx-a11y` rules catch the common mistakes.

**Tests**

- Engine and ops changes need unit tests.
- New pages go into the route smoke test (`src/app/routes.test.tsx`).
- Schema changes are a new file in `supabase/migrations/` (never edit an applied migration), plus tests in `supabase/tests/`.

## Commits

Small, focused commits with an imperative subject line ("Add rest-time override to court call").
