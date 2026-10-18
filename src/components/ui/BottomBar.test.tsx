import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { BottomBar, type BottomBarItem } from '@/components/ui/BottomBar';

const ITEMS: BottomBarItem[] = [
  { to: '/t/x', label: 'Live', icon: 'live', end: true },
  { to: '/t/x/draws', label: 'Draws', icon: 'draws' },
];

describe('BottomBar', () => {
  it('marks the current page', () => {
    render(
      <MemoryRouter initialEntries={['/t/x/draws/ms']}>
        <BottomBar items={ITEMS} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Draws' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Live' })).not.toHaveAttribute('aria-current');
  });

  it('opens More, which says when the current page is in it', async () => {
    const onOpen = vi.fn();
    render(
      <MemoryRouter initialEntries={['/t/x/settings']}>
        <BottomBar items={ITEMS} more={{ open: false, active: true, onOpen }} />
      </MemoryRouter>,
    );
    const more = screen.getByRole('button', { name: /More/ });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveAccessibleName('More (current page is in here)');
    await userEvent.setup().click(more);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
