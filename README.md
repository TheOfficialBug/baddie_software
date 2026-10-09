# Smashboard

Run badminton tournaments end to end: registration, BWF-compliant draws (Round Robin, ABCD Drop Flight, Knockout),
an organizer desk for match day (courts, live scores from paper slips, notifications), and public live pages where
players and spectators follow courts, brackets and their next match on any device. Light, graphite dark and system themes.

> Status: the front end is complete, with accounts (email + password, Google) and role-based access for players,
> scorers, admins and owners. Without Supabase settings it runs in demo mode on data stored in the browser, with
> ready-made demo accounts. The Supabase database is designed and tested ([supabase/SCHEMA.md](supabase/SCHEMA.md));
> connecting it is described in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Quick start

Requires Node.js 20.19+ (22 recommended, see `.nvmrc`).

```bash
npm install
npm run dev          # http://localhost:5173
```

Copy `.env.example` to `.env.local` to change routing or connect Supabase. Nothing is required for local development.

## Scripts

| Command                  | What it does                                                               |
| ------------------------ | -------------------------------------------------------------------------- |
| `npm run dev`            | Dev server with hot reload                                                 |
| `npm run build`          | Typecheck, then production build into `dist/`                              |
| `npm run preview`        | Serve the production build locally                                         |
| `npm run check`          | Everything CI runs: typecheck, lint, format check, tests, migration check  |
| `npm test`               | All tests once (engine, data, UI, database)                                |
| `npm run test:watch`     | Tests in watch mode                                                        |
| `npm run test:coverage`  | Tests with a coverage report in `coverage/`                                |
| `npm run lint` / `lint:fix` | ESLint (TypeScript, React hooks, accessibility, import order)           |
| `npm run format` / `format:check` | Prettier (with Tailwind class sorting)                            |
| `npm run db:check`       | Apply `supabase/migrations` to an in-memory Postgres and report errors     |
| `npm run build:artifact` | One self-contained HTML file in `dist-artifact/` for sharing a preview     |

## Project layout

```
src/
  app/          entry point, router, route table, root layout, error screen
  config/       app constants and typed, validated environment variables
  engine/       pure TypeScript domain logic: scoring rules, draws, pairing, standings, progression, scheduling
  data/         state: store (zustand), pure state transitions (ops), lookups, derived queries, demo data, toasts
  components/
    ui/         design-system primitives: Button, Dialog, Select, Field, Tabs, Stepper, Icon, …
    match/ draw/ tournament/ notices/ help/   domain components shared by several screens
  features/
    public/     home, tournament pages (overview, courts, draws, schedule, players), registration, my matches, TV
    admin/      organizer desk: dashboard, courts, live scoring, entries, draws, slips, notifications, settings
  hooks/ lib/   small shared hooks and utilities
  styles/       Tailwind entry and design tokens (light + graphite dark)
  test/         test setup
supabase/       database migration, schema design notes, database tests
docs/           architecture, deployment, product plan
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before adding features, and [CONTRIBUTING.md](CONTRIBUTING.md) for conventions.

## Deploying

The app is a static site. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Vercel, Netlify, Cloudflare Pages and plain static hosting,
including the security headers and SPA fallback that ship in this repo.

## Tech

React 18 · TypeScript (strict) · Vite 8 · Tailwind CSS 3 · React Router 7 (data router, code-split routes) · zustand ·
Hugeicons · Vitest + Testing Library · PGlite for database tests · Supabase (planned backend).
