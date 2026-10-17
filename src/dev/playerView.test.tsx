// What a player sees on match day, page by page, on the simulated tournament of `npm run dev:player`:
// live scores, draws, notifications and announcements, and joining the waitlist. Signed out, like most visitors.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeAll, describe, expect, it } from 'vitest';

import { useStore } from '@/data/store';

import { createLocalBackend, initAuth } from '@/auth/authStore';

import { routes } from '@/app/routes';

import { buildPreview, PREVIEW_SLUG } from '@/dev/playerPreview';

const T = `/t/${PREVIEW_SLUG}`;

async function open(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(<RouterProvider router={router} />);
  await waitFor(() => expect(document.querySelector('main, [role=main], h1')).toBeTruthy(), { timeout: 10_000 });
  return { router, view };
}

beforeAll(async () => {
  useStore.setState({ ...buildPreview(new Date('2026-10-18T11:00:00').getTime()), noticesSeenAt: 0 });
  await initAuth(createLocalBackend());
});

describe('player view on match day', () => {
  it('live scores: every court shows who is playing and the score so far', async () => {
    const { view } = await open(`${T}/courts`);
    expect(await screen.findByText(/live now/i, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.getByText(/court 1/i)).toBeInTheDocument();
    const s = useStore.getState();
    const onCourt = s.matches.find((m) => m.status === 'on_court' && m.live && m.live[0] + m.live[1] > 0)!;
    const entry = s.entries.find((e) => e.id === onCourt.a)!;
    const name = s.players.find((p) => p.id === entry.playerIds[0])!.name;
    expect(screen.getAllByText(new RegExp(name)).length).toBeGreaterThan(0);
    view.unmount();
  });

  it('draws: every event is listed and opens its bracket or groups', async () => {
    const { view } = await open(`${T}/draws`);
    const s = useStore.getState();
    const t = s.tournaments.find((x) => x.slug === PREVIEW_SLUG)!;
    const events = s.events.filter((e) => e.tournamentId === t.id);
    for (const ev of events) expect((await screen.findAllByText(ev.name, {}, { timeout: 10_000 })).length).toBeGreaterThan(0);
    view.unmount();
    const ev = await open(`${T}/draws/${events[0].id}`);
    expect((await screen.findAllByText(events[0].name, {}, { timeout: 10_000 })).length).toBeGreaterThan(0);
    ev.view.unmount();
  });

  it('notifications: the bell shows announcements and court call-ups', async () => {
    const { view } = await open(`${T}/courts`);
    const bell = await screen.findByRole('button', { name: /notifications/i }, { timeout: 10_000 });
    expect(bell.getAttribute('aria-label')).toMatch(/new/);
    fireEvent.click(bell);
    const panel = await screen.findByRole('dialog', {}, { timeout: 10_000 });
    expect(within(panel).getAllByText(/welcome to the iowa open/i).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/court/i).length).toBeGreaterThan(0);
    view.unmount();
  });

  it('join the waitlist: checks the form, then confirms', async () => {
    const { view } = await open('/waitlist');
    fireEvent.click(await screen.findByRole('button', { name: 'Get early access' }, { timeout: 10_000 }));
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pat Player' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'pat@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Get early access' }));
    expect(await screen.findByText('You’re on the list')).toBeInTheDocument();
    view.unmount();
  });

  it('registration is closed: no Register button anywhere on the tournament', async () => {
    const { view } = await open(T);
    await screen.findAllByText(/iowa open test 26/i, {}, { timeout: 10_000 });
    expect(screen.queryByRole('link', { name: /^register/i })).not.toBeInTheDocument();
    view.unmount();
  });
});
