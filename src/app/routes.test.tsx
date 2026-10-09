// Smoke test: every screen renders with the demo data, without throwing or showing the error page,
// and each area is open only to the right people.
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO_PASSWORD } from '@/config/demo';

import { useStore } from '@/data/store';

import { authActions, createLocalBackend, initAuth } from '@/auth/authStore';

import { routes } from '@/app/routes';

import { buildSampleData } from '@/test/fixtures/sampleTournaments';

const OWNER = 'alex@smashboard.demo';
const SCORER = 'sam@smashboard.demo';
const PLAYER = 'player@smashboard.demo';

let paths: string[] = [];

beforeAll(async () => {
  // a mid-tournament state (live matches, open registration, a finished event)
  useStore.setState(buildSampleData());
  await initAuth(createLocalBackend());
  const s = useStore.getState();
  const live = s.tournaments.find((t) => t.status === 'live')!;
  const open = s.tournaments.find((t) => t.status === 'registration')!;
  const done = s.tournaments.find((t) => t.status === 'completed')!;
  const ev = s.events.find((e) => e.tournamentId === live.id && e.drawState === 'published')!;
  const match = s.matches.find((m) => m.eventId === ev.id && m.status === 'on_court')!;
  const player = s.entries.find((e) => e.eventId === ev.id)!.playerIds[0];
  const pub = `/t/${live.slug}`;
  const adm = `/admin/t/${live.id}`;
  paths = [
    '/',
    '/me',
    '/account',
    `/t/${open.slug}/register`,
    pub,
    `${pub}/courts`,
    `${pub}/draws`,
    `${pub}/draws/${ev.id}`,
    `${pub}/schedule`,
    `${pub}/players`,
    `${pub}/players/${player}`,
    `${pub}/tv`,
    `/t/${done.slug}`,
    `/t/${open.slug}`,
    '/admin',
    adm,
    `${adm}/courts`,
    `${adm}/scores`,
    `${adm}/m/${match.id}`,
    `${adm}/entries`,
    `${adm}/draws`,
    `${adm}/draws/${ev.id}`,
    `${adm}/slips`,
    `${adm}/notify`,
    `${adm}/players`,
    `${adm}/settings`,
    `${adm}/simulate`,
  ];
});

beforeEach(async () => {
  await authActions.signOut();
});

async function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(<RouterProvider router={router} />);
  await waitFor(() => expect(screen.queryByRole('status', { name: /Loading|Checking/ })).not.toBeInTheDocument(), { timeout: 10_000 });
  await waitFor(() => expect(view.container.querySelector('h1')).not.toBeNull(), { timeout: 10_000 });
  return { router, view };
}

describe('routes', () => {
  it('renders every page for the owner without errors', async () => {
    await authActions.signIn(OWNER, DEMO_PASSWORD);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const path of paths) {
      const { view } = await renderAt(path);
      expect(view.container.querySelector('[role="alert"]'), `error or no-access at ${path}`).toBeNull();
      expect(screen.queryByText(/couldn.t find that/i), `not-found at ${path}`).toBeNull();
      view.unmount();
    }
    expect(errors.mock.calls.filter((c) => !String(c[0]).includes('not wrapped in act'))).toEqual([]);
    errors.mockRestore();
  }, 120_000);

  it('shows the not-found page for unknown URLs', async () => {
    await renderAt('/no-such-page');
    expect(screen.getByRole('heading', { name: /couldn.t find that page/i })).toBeInTheDocument();
  });

  it('redirects old /live links to the courts tab', async () => {
    const live = useStore.getState().tournaments.find((t) => t.status === 'live')!;
    const { router } = await renderAt(`/t/${live.slug}/live`);
    expect(router.state.location.pathname).toBe(`/t/${live.slug}/courts`);
  });
});

describe('access', () => {
  it('public pages need no account', async () => {
    const live = useStore.getState().tournaments.find((t) => t.status === 'live')!;
    const { router } = await renderAt(`/t/${live.slug}/draws`);
    expect(router.state.location.pathname).toBe(`/t/${live.slug}/draws`);
  });

  it.each(['/me', '/account', '/admin', '/admin/t/t-fall/scores'])(
    'signed-out visitors of %s are sent to sign in, then back',
    async (path) => {
      const { router } = await renderAt(path);
      expect(router.state.location.pathname).toBe('/login');
      expect(new URLSearchParams(router.state.location.search).get('next')).toBe(path);
      expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    },
  );

  it('players cannot open the organizer desk', async () => {
    await authActions.signIn(PLAYER, DEMO_PASSWORD);
    await renderAt('/admin');
    expect(screen.getByRole('heading', { name: /organizer desk is for tournament staff/i })).toBeInTheDocument();
  });

  it('scorers run match day but cannot open draws, entries or settings', async () => {
    await authActions.signIn(SCORER, DEMO_PASSWORD);
    let r = await renderAt('/admin/t/t-fall');
    expect(screen.getByRole('region', { name: 'Tournament stage' })).toBeInTheDocument();
    // the stage buttons are for admins; scorers see where things stand
    expect(
      screen.queryByRole('button', { name: /^(close registration|start match day|finish tournament|finish early)$/i }),
    ).not.toBeInTheDocument();
    r.view.unmount();
    for (const page of ['draws', 'entries', 'settings']) {
      r = await renderAt(`/admin/t/t-fall/${page}`);
      expect(screen.getByRole('heading', { name: /for tournament admins/i }), page).toBeInTheDocument();
      r.view.unmount();
    }
  });

  it('signed-in people skip the sign-in page', async () => {
    await authActions.signIn(PLAYER, DEMO_PASSWORD);
    const { router } = await renderAt('/login?next=%2Faccount');
    await waitFor(() => expect(router.state.location.pathname).toBe('/account'));
  });
});
