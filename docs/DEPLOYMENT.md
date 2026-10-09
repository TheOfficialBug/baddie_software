# Deployment

`npm run build` produces a static site in `dist/`. Any static host works.

## Routing

Clean URLs (`/t/prairie-fall-open/draws`) need the host to serve `index.html` for paths that aren't files.
This repo ships that configuration:

| Host | File | Notes |
| --- | --- | --- |
| Vercel | `vercel.json` | rewrites, security headers, asset caching |
| Netlify, Cloudflare Pages | `public/_redirects`, `public/_headers` | copied into `dist/` by the build |

If your host can't do rewrites (e.g. GitHub Pages), build with hash URLs instead:

```bash
VITE_ROUTER=hash npm run build
```

To serve from a sub-path, set `VITE_BASE_PATH=/smashboard/` (path routing) or use hash routing.

## Environment variables

Set these in the host's dashboard (see `.env.example`). They are baked in at build time.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_ROUTER` | no | `browser` (default) or `hash` |
| `VITE_BASE_PATH` | no | sub-path for path routing, default `/` |
| `VITE_SITE_URL` | no | public origin used in QR codes on score slips |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | once the backend is connected | Supabase project URL and public anon key |

Never put the Supabase `service_role` key in a `VITE_` variable: everything in them ships to browsers.
The app fails fast with a clear message if a variable is malformed.

## Accounts and sign-in

Without Supabase settings the app runs in **demo mode**: accounts live in the browser and the sign-in page offers
ready-made Organizer, Scorer and Player accounts (password `smashboard`). Demo mode is for previews only.

With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set, sign-in uses Supabase Auth. In the Supabase dashboard:

1. **Authentication → URL Configuration**: set _Site URL_ to your domain, and add `https://YOUR_DOMAIN/auth/callback`
   and `https://YOUR_DOMAIN/reset-password` (plus the `http://localhost:5173/...` equivalents for development) to _Redirect URLs_.
2. **Authentication → Providers → Email**: keep _Confirm email_ on, and set the minimum password length to 8.
3. **Google** (optional): create an OAuth client in Google Cloud (authorized redirect URI
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`), paste its ID and secret under _Providers → Google_,
   then set `VITE_AUTH_GOOGLE=true` and rebuild.

Staff access comes from `organization_members` (owner, admin, scorer). Owners invite people by email from
*Tournament settings → Team*; the invite turns into a membership when that person signs in with the verified email.
A new account is linked to the player record registered with the same verified email.

## Security headers

`vercel.json` and `public/_headers` set a Content Security Policy (scripts only from the site itself, fonts from
Google Fonts, network calls to the site and `*.supabase.co`), HSTS, `nosniff`, a strict referrer policy and
`frame-ancestors 'none'`. If you add a third-party script, analytics or another API, extend the CSP in both files.

## Caching

Files in `/assets/` have content hashes and are cached for a year. `index.html` and `theme-init.js` are revalidated
on every load, so a deploy reaches everyone immediately. A tab still running an old version reloads itself
once when it can't find a code chunk (see `src/app/RouteError.tsx`).

## Database

The schema is in `supabase/migrations/`. To apply it to your Supabase project:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

`npm run db:check` and the database tests run the same migration against an in-memory Postgres in CI.

## CI

`.github/workflows/ci.yml` runs on every push and pull request: typecheck, lint, format check, all tests,
migration check and a production build (uploaded as an artifact).
