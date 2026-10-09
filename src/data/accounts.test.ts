import { beforeEach, describe, expect, it } from 'vitest';

import * as accounts from '@/data/accounts';
import { buildDemo } from '@/data/demo';
import type { DB } from '@/data/types';

let db: DB;
beforeEach(() => {
  db = buildDemo(Date.UTC(2026, 9, 10, 15, 0));
});

describe('team', () => {
  it('invites by email; the invite becomes a membership when that email signs in', () => {
    const r = accounts.inviteMember(db, 'org-demo', ' New.Coach@Example.com ', 'admin');
    expect(r.error).toBeUndefined();
    expect(accounts.inviteMember(r.db!, 'org-demo', 'new.coach@example.com', 'scorer').error).toMatch(/already been invited/);
    const joined = accounts.acceptInvites(r.db!, 'u-new', 'new.coach@example.com');
    expect(joined.members).toContainEqual({ orgId: 'org-demo', userId: 'u-new', role: 'admin' });
    expect(joined.orgInvites).toHaveLength(0);
  });

  it('rejects bad emails and people already on the team', () => {
    expect(accounts.inviteMember(db, 'org-demo', 'nope', 'scorer').error).toMatch(/valid email/);
    expect(accounts.inviteMember(db, 'org-demo', 'sam@smashboard.demo', 'scorer').error).toMatch(/already on the team/);
  });

  it('always keeps an owner', () => {
    expect(accounts.setMemberRole(db, 'org-demo', 'u-alex', 'admin').error).toMatch(/someone else an owner/);
    expect(accounts.removeMember(db, 'org-demo', 'u-alex').error).toMatch(/last owner/);
    const twoOwners = accounts.setMemberRole(db, 'org-demo', 'u-sam', 'owner').db!;
    expect(accounts.setMemberRole(twoOwners, 'org-demo', 'u-alex', 'admin').db).toBeDefined();
    expect(accounts.removeMember(db, 'org-demo', 'u-sam').db!.members.some((m) => m.userId === 'u-sam')).toBe(false);
  });
});

describe('player link', () => {
  it('links an account to the unclaimed player registered with its email', () => {
    const p = db.players.find((x) => !x.userId)!;
    db = { ...db, players: db.players.map((x) => (x.id === p.id ? { ...x, email: 'someone@example.com' } : x)) };
    const r = accounts.claimPlayer(db, 'u-someone', 'Someone@example.com');
    expect(r.playerId).toBe(p.id);
    expect(r.db.players.find((x) => x.id === p.id)?.userId).toBe('u-someone');
    expect(accounts.claimPlayer(r.db, 'u-someone', 'other@example.com').playerId).toBe(p.id);
    expect(accounts.claimPlayer(db, 'u-x', 'nobody@example.com').playerId).toBeNull();
  });

  it('the demo player account is linked to its player', () => {
    expect(db.players.find((p) => p.userId === 'u-player')?.id).toBe('p-M5');
    expect(db.members.map((m) => [m.userId, m.role])).toEqual([
      ['u-alex', 'owner'],
      ['u-sam', 'scorer'],
    ]);
  });
});
