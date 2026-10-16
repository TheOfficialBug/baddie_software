import { render, screen, within } from '@testing-library/react';
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
