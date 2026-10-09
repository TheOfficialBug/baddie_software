import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/useConfirm';

function ResetButton({ onReset }: { onReset: () => void }) {
  const { ask, dialog } = useConfirm();
  return (
    <>
      <Button
        onClick={() =>
          ask({
            title: 'Reset the draw?',
            warning: '3 results will be deleted.',
            confirmLabel: 'Reset draw',
            danger: true,
            onConfirm: onReset,
          })
        }
      >
        Reset
      </Button>
      {dialog}
    </>
  );
}

describe('confirm dialog', () => {
  it('does nothing on Cancel', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<ResetButton onReset={onReset} />);
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText('3 results will be deleted.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onReset).not.toHaveBeenCalled();
  });

  it('runs the action once confirmed', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<ResetButton onReset={onReset} />);
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await user.click(screen.getByRole('button', { name: 'Reset draw' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
