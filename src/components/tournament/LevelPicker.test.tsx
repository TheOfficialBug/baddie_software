import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LevelPicker } from '@/components/tournament/LevelPicker';

describe('LevelPicker', () => {
  it('starts with nothing chosen and reports the picked level', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LevelPicker label="Your singles level" value={undefined} onChange={onChange} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    await user.click(screen.getByRole('radio', { name: /Competitive/ }));
    expect(onChange).toHaveBeenCalledWith('B');
  });

  it('shows the required error', () => {
    render(<LevelPicker label="Your level" value={undefined} onChange={() => undefined} error="Choose your level to continue." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose your level to continue.');
    expect(screen.getByRole('group', { name: /Your level/ })).toHaveAttribute('aria-invalid', 'true');
  });
});
