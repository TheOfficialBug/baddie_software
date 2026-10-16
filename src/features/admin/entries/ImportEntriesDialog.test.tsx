import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildIowaOpen, IOWA_OPEN_ID } from '@/data/seed/iowaOpen';
import { useStore } from '@/data/store';

import { ImportEntriesDialog } from '@/features/admin/entries/ImportEntriesDialog';

const csv = [
  'Test Open',
  'No.,Name,Firstname,City,State,Country,DOB,Gender,Club,Level1,Level2,Ev.,Events,Entry Info',
  `1,Lin,Jo,,,,1995,M,Riverside BC,B,B,2,"Men's Singles, Mixed Doubles","Men's Singles\nMixed Doubles Ana Ortega"`,
  `2,Ortega,Ana,,,,1998,F,N/A,,C,1,Mixed Doubles,Mixed Doubles Jo Lin`,
].join('\n');

beforeEach(() => {
  useStore.setState(buildIowaOpen(Date.UTC(2026, 9, 1)));
});

describe('import entries', () => {
  it('previews the list, then replaces the entries', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const t = useStore.getState().tournaments.find((x) => x.id === IOWA_OPEN_ID)!;
    render(<ImportEntriesDialog t={t} onClose={onClose} />);

    await user.upload(screen.getByLabelText('Choose a spreadsheet'), new File([csv], 'players.csv', { type: 'text/csv' }));
    expect(await screen.findByText('players.csv')).toBeInTheDocument();
    expect(screen.getByText(/not on the list and will be removed/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Import 2 entries' }));
    expect(onClose).toHaveBeenCalled();
    const s = useStore.getState();
    const entries = s.entries.filter((e) => e.eventId.startsWith(IOWA_OPEN_ID));
    const name = (id: string) => s.players.find((p) => p.id === id)?.name;
    expect(entries.map((e) => `${e.eventId}: ${e.playerIds.map(name).join(' / ')}`).sort()).toEqual([
      `${IOWA_OPEN_ID}-MS: Jo Lin`,
      `${IOWA_OPEN_ID}-XD: Jo Lin / Ana Ortega`,
    ]);
  });

  it('explains files it cannot read', async () => {
    const user = userEvent.setup();
    const t = useStore.getState().tournaments[0];
    render(<ImportEntriesDialog t={t} onClose={() => {}} />);
    await user.upload(screen.getByLabelText('Choose a spreadsheet'), new File(['a,b\n1,2'], 'other.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No column headings found/);
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });
});
