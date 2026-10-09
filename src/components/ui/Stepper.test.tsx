import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Stepper } from '@/components/ui/Stepper';

function Harness({ initial = 4, min = 1, max = 6 }: { initial?: number; min?: number; max?: number }) {
  const [v, setV] = useState(initial);
  return <Stepper label="Courts" value={v} onChange={setV} min={min} max={max} />;
}

describe('Stepper', () => {
  it('steps up and down within its limits', async () => {
    const user = userEvent.setup();
    render(<Harness initial={5} max={6} />);
    const input = screen.getByRole('textbox', { name: 'Courts' });
    await user.click(screen.getByRole('button', { name: 'More courts' }));
    expect(input).toHaveValue('6');
    expect(screen.getByRole('button', { name: 'More courts' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Fewer courts' }));
    expect(input).toHaveValue('5');
  });

  it('clamps typed numbers and ignores non-digits', () => {
    render(<Harness initial={4} min={1} max={6} />);
    const input = screen.getByRole('textbox', { name: 'Courts' });
    fireEvent.change(input, { target: { value: '12' } });
    expect(input).toHaveValue('6');
    fireEvent.change(input, { target: { value: '3 courts' } });
    expect(input).toHaveValue('3');
    fireEvent.change(input, { target: { value: '0' } });
    expect(input).toHaveValue('1');
  });
});
