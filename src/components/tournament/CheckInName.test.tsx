import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeLookup } from '@/data/lookup';
import { emptyDB } from '@/data/types';

import { EntryNames } from '@/components/tournament/CheckInName';

const db = {
  ...emptyDB(),
  players: [
    { id: 'p1', name: 'Ana Ruiz', gender: 'F' as const, club: 'Ames', birthYear: 1990, level: 'A' as const },
    { id: 'p2', name: 'Ben Cho', gender: 'M' as const, club: 'Ames', birthYear: 1990, level: 'B' as const },
  ],
  entries: [{ id: 'e1', eventId: 'xd', playerIds: ['p1', 'p2'], status: 'accepted' as const, createdAt: 0 }],
};
const lk = makeLookup(db);

describe('EntryNames', () => {
  it('marks each player as checked in or not', () => {
    render(<EntryNames lk={lk} entry="e1" checkIns={new Map([['p1', { tournamentId: 't', playerId: 'p1', at: 0 }]])} />);
    expect(screen.getByText('Ana Ruiz').parentElement).toContainElement(screen.getByRole('img', { name: 'Checked in' }));
    expect(screen.getByText('Ben Cho').parentElement).toContainElement(screen.getByRole('img', { name: 'Not checked in' }));
    expect(screen.getByText('Ben Cho').parentElement).toHaveClass('text-muted');
  });

  it('shows plain names when check-in is not in use', () => {
    render(<EntryNames lk={lk} entry="e1" />);
    expect(screen.getByText('Ana Ruiz / Ben Cho')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
