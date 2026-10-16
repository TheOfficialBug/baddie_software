import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ID } from '@/engine/types';

import { useLookup } from '@/data/lookup';
import { buildIowaOpen, IOWA_OPEN_ID } from '@/data/seed/iowaOpen';
import { useStore } from '@/data/store';

import { SeedingList } from '@/features/admin/draws/SeedingList';

const EV = `${IOWA_OPEN_ID}-MS`;

function Harness() {
  const lk = useLookup();
  const ids = lk
    .entriesOf(EV)
    .filter((e) => e.status === 'accepted')
    .map((e) => e.id);
  const auto = () => [...ids].sort((a, b) => lk.entryLevel(b) - lk.entryLevel(a) || ids.indexOf(a) - ids.indexOf(b));
  const [order, setOrder] = useState<ID[]>(auto);
  return (
    <SeedingList
      lk={lk}
      eventId={EV}
      order={order}
      onOrderChange={setOrder}
      defaultOrder={auto}
      seeds={4}
      pairing="balanced"
      levelOf={lk.entryLevel}
    />
  );
}

/** Names in the seeding list (the ordered list, not the drafts list). */
const rows = () =>
  [...screen.getByRole('region', { name: 'Seeding order' }).querySelectorAll('ol > li')].map(
    (li) => li.querySelector('.truncate')?.textContent ?? '',
  );

beforeEach(() => {
  useStore.setState(buildIowaOpen(Date.UTC(2026, 9, 1)));
});

describe('seeding order history', () => {
  it('undoes and redoes moves, and resets to the automatic order', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const start = rows();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset order' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: `Move ${start[1]} up` }));
    const moved = [start[1], start[0], ...start.slice(2)];
    expect(rows()).toEqual(moved);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(rows()).toEqual(start);
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(rows()).toEqual(moved);
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Reset order' }));
    expect(rows()).toEqual(start);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(rows()).toEqual(moved);
    // many clicks over a 40-row list; slow when the full suite runs in parallel
  }, 30_000);

  it('undoes a level change', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const name = rows()[0];
    const levelOf = () => {
      const s = useStore.getState();
      const p = s.players.find((x) => x.name === name)!;
      const e = s.entries.find((x) => x.eventId === EV && x.playerIds[0] === p.id)!;
      return e.levels?.[0] ?? p.level;
    };
    const original = levelOf();
    const other = original === 'D' ? 'A' : 'D';
    await user.click(screen.getByRole('button', { name: `Skill level for ${name}` }));
    await user.click(screen.getByRole('option', { name: new RegExp(`^${other} ·`) }));
    expect(levelOf()).toBe(other);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(levelOf()).toBe(original);
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(levelOf()).toBe(other);
  });

  it('pastes an order from text, and saves and loads drafts', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const start = rows();
    // paste the list reversed (names only)
    await user.click(screen.getByRole('button', { name: 'Paste list' }));
    const box = screen.getByRole('textbox', { name: /One player \(or pair\) per row/ });
    await user.click(box);
    await user.paste([...start].reverse().join('\n'));
    expect(screen.getByText(`${start.length} of ${start.length} matched`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(rows()).toEqual([...start].reverse());

    // save it as a draft, undo the paste, then load the draft
    await user.click(screen.getByRole('button', { name: 'Drafts' }));
    await user.type(screen.getByRole('textbox', { name: 'Draft name' }), 'Reversed');
    await user.click(screen.getByRole('button', { name: 'Save as draft' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(rows()).toEqual(start);
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(rows()).toEqual([...start].reverse());
    expect(screen.getByRole('button', { name: 'Drafts (1)' })).toBeInTheDocument();
  }, 30_000);
});
