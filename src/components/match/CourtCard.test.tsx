import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeLookup } from '@/data/lookup';

import { CourtCard } from '@/components/match/CourtCard';

import { buildSampleData } from '@/test/fixtures/sampleTournaments';

function setup(onScoreInput: (side: 'a' | 'b', points: number) => string | null) {
  const db = buildSampleData(Date.UTC(2026, 9, 10, 15, 0));
  const lk = makeLookup(db);
  const m = db.matches.find((x) => x.status === 'on_court')!;
  const t = db.tournaments.find((x) => x.courts.some((c) => c.id === m.courtId))!;
  const court = t.courts.find((c) => c.id === m.courtId)!;
  render(<CourtCard lk={lk} court={court} match={{ ...m, live: [12, 9] }} now={Date.now()} onScoreInput={onScoreInput} />);
  return { a: lk.entryName(m.a), b: lk.entryName(m.b) };
}

describe('court card score box', () => {
  it('types a score for a side and saves it on Enter', async () => {
    const user = userEvent.setup();
    const onScoreInput = vi.fn().mockReturnValue(null);
    const names = setup(onScoreInput);
    const box = screen.getByRole('textbox', { name: `Points for ${names.a}` });
    expect(box).toHaveValue('12');
    await user.click(box);
    await user.keyboard('{Control>}a{/Control}17{Enter}');
    expect(onScoreInput).toHaveBeenCalledWith('a', 17);
  });

  it('shows why a score was refused and puts the old value back', async () => {
    const user = userEvent.setup();
    setup(() => '23-9 is not a possible score.');
    const box = screen.getAllByRole('textbox')[0];
    await user.click(box);
    await user.keyboard('{Control>}a{/Control}23{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('not a possible score');
    expect(box).toHaveValue('12');
  });

  it('Esc cancels without saving', async () => {
    const user = userEvent.setup();
    const onScoreInput = vi.fn().mockReturnValue(null);
    setup(onScoreInput);
    const box = screen.getAllByRole('textbox')[1];
    await user.click(box);
    await user.keyboard('{Control>}a{/Control}20{Escape}');
    expect(onScoreInput).not.toHaveBeenCalled();
    expect(box).toHaveValue('9');
  });
});
