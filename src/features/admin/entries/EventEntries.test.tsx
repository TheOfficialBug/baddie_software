import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeLookup } from '@/data/lookup';
import { buildIowaOpen, IOWA_OPEN_ID } from '@/data/seed/iowaOpen';
import { useStore } from '@/data/store';

import { EventEntries } from '@/features/admin/entries/EventEntries';

const db = buildIowaOpen(Date.UTC(2026, 9, 1));
const lk = makeLookup(db);
const t = lk.tournament(IOWA_OPEN_ID)!;
const ev = lk.event(`${IOWA_OPEN_ID}-MS`)!;
const rowNames = () =>
  within(screen.getByRole('region', { name: ev.name }))
    .getAllByRole('listitem')
    .slice(1) // column headings
    .map((li) => li.querySelector('.truncate')?.textContent ?? '');

beforeEach(() => {
  useStore.setState(db);
});

describe('event entries', () => {
  it('searches by name or club, ignoring case and accents', async () => {
    const user = userEvent.setup();
    const target = lk.entryName(lk.entriesOf(ev.id)[0].id);
    render(
      <MemoryRouter>
        <EventEntries lk={lk} t={t} ev={ev} onEdit={() => {}} />
      </MemoryRouter>,
    );
    await user.type(screen.getByRole('textbox', { name: `Search ${ev.name} entries` }), target.toUpperCase());
    expect(rowNames()).toEqual([target]);
    await user.clear(screen.getByRole('textbox', { name: `Search ${ev.name} entries` }));
    await user.type(screen.getByRole('textbox', { name: `Search ${ev.name} entries` }), 'zzz nobody');
    expect(screen.getByText('No entries match “zzz nobody”')).toBeInTheDocument();
  });

  it('sorts by name', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <EventEntries lk={lk} t={t} ev={ev} onEdit={() => {}} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Sort entries by' }));
    await user.click(screen.getByRole('option', { name: 'Name (A–Z)' }));
    const names = rowNames();
    expect(names).toHaveLength(lk.entriesOf(ev.id).length);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
