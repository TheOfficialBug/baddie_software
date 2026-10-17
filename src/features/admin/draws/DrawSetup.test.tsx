import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { useLookup } from '@/data/lookup';
import { buildIowaOpen, IOWA_OPEN_ID } from '@/data/seed/iowaOpen';
import { useStore } from '@/data/store';

import { DrawSetup } from '@/features/admin/draws/DrawSetup';

const EV = `${IOWA_OPEN_ID}-MS`;

function Harness() {
  const lk = useLookup();
  return <DrawSetup lk={lk} t={lk.tournament(IOWA_OPEN_ID)!} ev={lk.event(EV)!} />;
}

const rows = () =>
  within(screen.getByRole('region', { name: 'Seeding order' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.truncate')?.textContent ?? '');

beforeEach(() => {
  useStore.setState(buildIowaOpen(Date.UTC(2026, 9, 1)));
});

describe('seeding order panel', () => {
  it('Cancel discards the changes, Save keeps them', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Seeding order' }));
    const start = rows();
    await user.click(screen.getByRole('button', { name: `Move ${start[1]} up` }));
    expect(rows()[0]).toBe(start[1]);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Seeding order' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Seeding order' }));
    expect(rows()).toEqual(start);
    await user.click(screen.getByRole('button', { name: `Move ${start[1]} up` }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Seeding order' }));
    expect(rows()[0]).toBe(start[1]);
    // renders the whole draw preview several times; slow when the full suite runs in parallel
  }, 30_000);
});

describe('draw preview', () => {
  it('redraws when a level changes, not only when the order does', () => {
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );
    // the warning comes from the draw itself (the summary chips read today's levels, so they'd change anyway)
    const warning = () => screen.getByText(/expected to finish outside their level's flight/).textContent;
    const before = warning();
    // every C player in men's singles becomes a B: a different field, so a different (redrawn) draw
    const db = useStore.getState();
    for (const e of db.entries.filter((x) => x.eventId === EV && x.levels?.[0] === 'C')) {
      act(() => useStore.getState().setEntryLevel(e.id, 0, 'B'));
    }
    expect(warning()).not.toBe(before);
  }, 30_000);
});

describe('moving players before publishing', () => {
  it('swaps two first-round places, keeps them in the preview, and publishes them', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Move players' }));
    // the tappable places (each has aria-pressed), in line order
    const places = () =>
      within(screen.getByRole('region', { name: 'A flight' }))
        .getAllByRole('button')
        .filter((el) => el.hasAttribute('aria-pressed') && el.closest('li'));
    const label = (i: number) => places()[i].textContent ?? '';
    const [a, b] = [label(1), label(3)];
    await user.click(places()[1]);
    await user.click(places()[3]);
    expect(label(1)).toBe(b);
    expect(label(3)).toBe(a);
    expect(screen.getByText(/You moved players by hand/)).toBeInTheDocument();
    // the published first round is the one moved by hand
    const moved = places().map((el) => el.textContent ?? '');
    await user.click(screen.getByRole('button', { name: 'Publish draw' }));
    const s = useStore.getState();
    const nameOf = (src: { kind: string; entryId?: string }) =>
      src.kind === 'entry'
        ? s.entries
            .find((e) => e.id === src.entryId)!
            .playerIds.map((pid) => s.players.find((x) => x.id === pid)!.name)
            .join(' / ')
        : 'Bye';
    const published = s.matches
      .filter((m) => m.stageId === `${EV}-A` && m.round === 1)
      .sort((x, y) => x.index - y.index)
      .flatMap((m) => [nameOf(m.srcA), nameOf(m.srcB)]);
    expect(published.slice(0, 4).map((n, i) => moved[i].startsWith(n))).toEqual([true, true, true, true]);
  }, 30_000);
});
