import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useLookup } from '@/data/lookup';
import { buildIowaOpen, IOWA_OPEN_ID } from '@/data/seed/iowaOpen';
import { useStore } from '@/data/store';

import { AddPlayerDialog } from '@/features/admin/entries/AddPlayerDialog';

function Harness() {
  const lk = useLookup();
  return <AddPlayerDialog lk={lk} t={lk.tournament(IOWA_OPEN_ID)!} onClose={() => undefined} />;
}

beforeEach(() => {
  useStore.setState(buildIowaOpen(Date.UTC(2026, 9, 1)));
});

const ev = (kind: string) => `${IOWA_OPEN_ID}-${kind}`;

describe('add a player by hand', () => {
  it('adds the player and their entries: singles, a doubles pair, and a partner not registered yet', async () => {
    const user = userEvent.setup();
    const s0 = useStore.getState();
    // a man in mixed doubles who isn't in a pair yet, to partner with
    const pairedXD = new Set(s0.entries.filter((e) => e.eventId === ev('XD') && e.playerIds.length > 1).flatMap((e) => e.playerIds));
    const partner = s0.players.find((p) => p.gender === 'M' && !pairedXD.has(p.id))!;
    render(<Harness />);

    await user.type(screen.getByLabelText('Name'), 'Test Player');
    await user.click(screen.getByRole('tab', { name: 'Female' }));
    await user.click(screen.getByRole('button', { name: /Open Women's Singles/ }));
    await user.click(screen.getByRole('button', { name: /Open Women's Doubles/ }));
    await user.click(screen.getByRole('button', { name: /Open Mixed Doubles/ }));
    const [wdPartner, xdPartner] = screen.getAllByLabelText('Partner');
    // WD: a partner who hasn't registered; XD: a player already in the tournament
    await user.type(wdPartner, 'Not Registered');
    await user.type(xdPartner, partner.name);
    await user.click(screen.getByRole('option', { name: new RegExp(partner.name) }));
    await user.click(screen.getByRole('button', { name: 'Add player' }));

    const s = useStore.getState();
    const me = s.players.find((p) => p.name === 'Test Player')!;
    expect(me.gender).toBe('F');
    const mine = (kind: string) => s.entries.filter((e) => e.eventId === ev(kind) && e.playerIds.includes(me.id));
    expect(mine('WS')).toHaveLength(1);
    expect(mine('WS')[0].status).toBe('accepted');
    expect(mine('WD')[0].pendingPartner?.name).toBe('Not Registered');
    expect(mine('WD')[0].status).toBe('accepted');
    expect(mine('XD')[0].playerIds).toContain(partner.id);
    expect(mine('XD')[0].levels).toHaveLength(2);
    expect(mine('MS')).toHaveLength(0);
  }, 30_000);

  it('a doubles event with no partner waits for one; an existing name adds entries to that player', async () => {
    const user = userEvent.setup();
    const s0 = useStore.getState();
    const someone = s0.players.find(
      (p) => p.gender === 'M' && !s0.entries.some((e) => e.eventId === ev('MD') && e.playerIds.includes(p.id)),
    )!;
    render(<Harness />);
    await user.type(screen.getByLabelText('Name'), someone.name);
    expect(screen.getByText(/is already in the tournament/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open Men's Doubles/ }));
    await user.click(screen.getByRole('button', { name: 'Add player' }));
    const s = useStore.getState();
    expect(s.players.filter((p) => p.name === someone.name)).toHaveLength(1);
    const md = s.entries.filter((e) => e.eventId === ev('MD') && e.playerIds.includes(someone.id));
    expect(md).toHaveLength(1);
    expect(md[0].status).toBe('pending');
  }, 30_000);
});
