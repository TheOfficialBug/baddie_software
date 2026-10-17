# Launch plan: Iowa Open 2026

The first live tournament runs on a reduced scope: **the organizers run everything from the desk, and everyone
else watches live**. Players don't need an account to follow the tournament.

## In scope

| Who | What |
| --- | --- |
| Organizer (owner) | Sign in, create the tournament, import the tournamentsoftware.com "Players" export, check pairs and levels, make and publish draws, run courts, enter scores live, send in-app announcements |
| Collaborators | Invited by email from **Organizer desk → Team**; scorers run courts and scores, admins can also change entries and draws |
| Players and spectators | Live courts, draws, brackets, group tables, schedule, each player's page and next match, TV mode for the hall. No sign-in needed |

Registration is closed in the app (it happened on tournamentsoftware.com). Register buttons appear only while a
tournament's status is **Registration open** and its closing date hasn't passed; the database enforces the same.

## Deferred (back after the tournament)

- Player sign-up and self-registration in the app (works, but needs email delivery set up first: Supabase's
  built-in sender allows only a few emails an hour; connect an SMTP provider such as Resend).
- Online payments (fees are paid to the organizer).
- Text and email notifications (in-app only for now).
- Self-serve organizations (any account creating its own organizer team). Today the site has one organization,
  owned by the account that signs in with the owner email set in the `20261017120000_app_entities` migration.

## How live data works

See [ARCHITECTURE.md](ARCHITECTURE.md) (data/ — state). In short: each record (tournament, event, entry, match, …) is
a row in Supabase's `app_entities` table. The desk writes the records it changes; every open page receives them
through Supabase Realtime within about a second, and catches up by version number if its connection drops.
Row level security lets only staff write; the public reads draws and results; undo history, unpublished draw edits
and check-ins are staff only; player emails live in `app_private`, readable only by staff.

## Match-day checklist

1. Owner signs in on the desk laptop; open **Team** and invite scorers' emails before the day.
2. Import the Players file (**Entries → Import**), review the warnings (unpaired partners, typed names).
3. **Close registration**, make the draws, check them, publish.
4. Open the public page on the hall TV (`/t/<slug>/tv`) and share the tournament link / QR code.
5. Keep one desk device as the main scoring station; scorers can score on their phones too.
