import { redirect, type RouteObject } from 'react-router';

import type { Capability, RouteHandle } from '@/auth/permissions';

import { NotFound } from '@/components/NotFound';

import { AppLoading, RootLayout } from '@/app/RootLayout';
import { RouteError } from '@/app/RouteError';
import { RequireAuth, RequireOrganizer } from '@/features/auth/guards';
import { PublicShell } from '@/features/public/PublicShell';

const needs = (cap: Capability): { handle: RouteHandle } => ({ handle: { cap } });

// Every page is code-split: visitors download only what they open, and the organizer
// desk never ships to spectators. Only the public shell is eager (it paints first).
//
// Access: tournament pages, courts, draws and TV are public. "My matches", registration and
// account settings need a signed-in account. The organizer desk needs a staff role; each desk
// page also declares the capability it needs (see auth/permissions.ts). The database enforces
// the same rules with row level security.
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    HydrateFallback: AppLoading,
    children: [
      // sign-in flows: focused pages without the site navigation
      { path: 'login', lazy: () => import('@/features/auth/LoginPage').then((m) => ({ Component: m.LoginPage })) },
      { path: 'signup', loader: () => redirect('/login?mode=signup'), Component: () => null },
      {
        path: 'forgot-password',
        lazy: () => import('@/features/auth/ForgotPasswordPage').then((m) => ({ Component: m.ForgotPasswordPage })),
      },
      { path: 'reset-password', lazy: () => import('@/features/auth/ResetPasswordPage').then((m) => ({ Component: m.ResetPasswordPage })) },
      { path: 'auth/callback', lazy: () => import('@/features/auth/AuthCallbackPage').then((m) => ({ Component: m.AuthCallbackPage })) },
      {
        element: <PublicShell />,
        errorElement: <RouteError />,
        children: [
          { index: true, lazy: () => import('@/features/public/home/Home').then((m) => ({ Component: m.Home })) },
          {
            element: <RequireAuth />,
            children: [
              { path: 'me', lazy: () => import('@/features/public/me/MyMatches').then((m) => ({ Component: m.MyMatches })) },
              { path: 'account', lazy: () => import('@/features/auth/AccountPage').then((m) => ({ Component: m.AccountPage })) },
              {
                path: 't/:slug/register',
                lazy: () => import('@/features/public/register/Register').then((m) => ({ Component: m.Register })),
              },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
      {
        path: 't/:slug',
        errorElement: <RouteError />,
        lazy: () => import('@/features/public/tournament/TournamentLayout').then((m) => ({ Component: m.TournamentLayout })),
        children: [
          { index: true, lazy: () => import('@/features/public/tournament/Overview').then((m) => ({ Component: m.Overview })) },
          { path: 'courts', lazy: () => import('@/features/public/tournament/LiveCourts').then((m) => ({ Component: m.LiveCourts })) },
          // old links (/t/:slug/live) keep working
          { path: 'live', loader: ({ params }) => redirect(`/t/${params.slug}/courts`), Component: () => null },
          { path: 'draws', lazy: () => import('@/features/public/tournament/Draws').then((m) => ({ Component: m.DrawsIndex })) },
          { path: 'draws/:eventId', lazy: () => import('@/features/public/tournament/Draws').then((m) => ({ Component: m.EventPage })) },
          { path: 'schedule', lazy: () => import('@/features/public/tournament/Schedule').then((m) => ({ Component: m.Schedule })) },
          { path: 'players', lazy: () => import('@/features/public/tournament/Players').then((m) => ({ Component: m.PlayersIndex })) },
          {
            path: 'players/:playerId',
            lazy: () => import('@/features/public/tournament/Players').then((m) => ({ Component: m.PlayerPage })),
          },
        ],
      },
      { path: 't/:slug/tv', lazy: () => import('@/features/public/tv/TVMode').then((m) => ({ Component: m.TVMode })) },
      {
        path: 'admin',
        element: <RequireOrganizer />,
        errorElement: <RouteError />,
        children: [
          {
            lazy: () => import('@/features/admin/AdminShell').then((m) => ({ Component: m.AdminShell })),
            children: [
              { index: true, lazy: () => import('@/features/admin/home/AdminHome').then((m) => ({ Component: m.AdminHome })) },
              {
                path: 't/:tid',
                ...needs('run_match_day'),
                lazy: () => import('@/features/admin/run/RunTournament').then((m) => ({ Component: m.RunTournament })),
              },
              // the court board now lives on the tournament home (match day stage)
              { path: 't/:tid/courts', loader: ({ params }) => redirect(`/admin/t/${params.tid}`), Component: () => null },
              {
                path: 't/:tid/scores',
                ...needs('run_match_day'),
                lazy: () => import('@/features/admin/scores/Scores').then((m) => ({ Component: m.Scores })),
              },
              {
                path: 't/:tid/m/:matchId',
                ...needs('run_match_day'),
                lazy: () => import('@/features/admin/scores/Scores').then((m) => ({ Component: m.Scores })),
              },
              // check-in lives on the Players page
              { path: 't/:tid/check-in', loader: ({ params }) => redirect(`/admin/t/${params.tid}/players`), Component: () => null },
              {
                path: 't/:tid/players',
                ...needs('run_match_day'),
                lazy: () => import('@/features/admin/players/LivePlayers').then((m) => ({ Component: m.LivePlayers })),
              },
              {
                path: 't/:tid/notify',
                ...needs('run_match_day'),
                lazy: () => import('@/features/admin/notify/Notify').then((m) => ({ Component: m.Notify })),
              },
              {
                path: 't/:tid/slips',
                ...needs('run_match_day'),
                lazy: () => import('@/features/admin/slips/PrintSlips').then((m) => ({ Component: m.PrintSlips })),
              },
              {
                path: 't/:tid/entries',
                ...needs('manage_entries'),
                lazy: () => import('@/features/admin/entries/AdminEvents').then((m) => ({ Component: m.AdminEvents })),
              },
              {
                path: 't/:tid/draws',
                ...needs('manage_draws'),
                lazy: () => import('@/features/admin/draws/DrawBuilder').then((m) => ({ Component: m.DrawBuilder })),
              },
              {
                path: 't/:tid/draws/:eventId',
                ...needs('manage_draws'),
                lazy: () => import('@/features/admin/draws/DrawBuilder').then((m) => ({ Component: m.DrawBuilder })),
              },
              {
                path: 't/:tid/settings',
                ...needs('manage_settings'),
                lazy: () => import('@/features/admin/settings/Settings').then((m) => ({ Component: m.Settings })),
              },
              {
                // test runs on demo data (the nav only shows it in demo mode)
                path: 't/:tid/simulate',
                ...needs('manage_settings'),
                lazy: () => import('@/features/admin/simulate/Simulator').then((m) => ({ Component: m.Simulator })),
              },
              { path: '*', element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
];
