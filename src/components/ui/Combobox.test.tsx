import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Combobox, type ComboOption } from '@/components/ui/Combobox';

const CLUBS: ComboOption[] = [{ value: 'Ames Shuttle Club' }, { value: 'Prairie Juniors', hint: '4 players' }, { value: 'No club' }];

function Harness({ onPick }: { onPick?: (o: ComboOption) => void }) {
  const [v, setV] = useState('');
  return (
    <>
      <Combobox aria-label="Club" value={v} onChange={setV} onPick={onPick} options={CLUBS} customLabel={(t) => `Use ${t}`} />
      <output>{v}</output>
    </>
  );
}

describe('Combobox', () => {
  it('suggests matching options and picks one with the keyboard', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await user.type(screen.getByRole('combobox', { name: 'Club' }), 'prai');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Prairie Juniors4 players', 'Use prai']);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('Prairie Juniors');
    expect(onPick).toHaveBeenCalledWith(CLUBS[1]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('keeps free text that matches nothing', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('combobox', { name: 'Club' }), 'Lincoln Shuttlers');
    await user.click(screen.getByRole('option', { name: 'Use Lincoln Shuttlers' }));
    expect(screen.getByRole('status')).toHaveTextContent('Lincoln Shuttlers');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Club' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
