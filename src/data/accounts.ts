// Pure operations on accounts and organization staff, used by the store (and the demo sign-in).
// The same rules are enforced by the database (accept_my_invites, claim_my_player, RLS).
import type { ID } from '@/engine/types';

import { uid } from '@/data/ops';
import type { DB, Profile, Role } from '@/data/types';

const norm = (email: string) => email.trim().toLowerCase();

export type TeamResult = { db: DB; error?: undefined } | { db?: undefined; error: string };

/** Create or refresh the public profile of an account. */
export function upsertProfile(db: DB, p: Profile): DB {
  const exists = db.profiles.some((x) => x.id === p.id);
  return { ...db, profiles: exists ? db.profiles.map((x) => (x.id === p.id ? { ...x, ...p } : x)) : [...db.profiles, p] };
}

/** Pending staff invites for this email become memberships (an existing membership is kept as is). */
export function acceptInvites(db: DB, userId: ID, email: string): DB {
  const mine = db.orgInvites.filter((i) => norm(i.email) === norm(email));
  if (!mine.length) return db;
  const members = [...db.members];
  for (const i of mine)
    if (!members.some((m) => m.orgId === i.orgId && m.userId === userId)) members.push({ orgId: i.orgId, userId, role: i.role });
  return { ...db, members, orgInvites: db.orgInvites.filter((i) => !mine.includes(i)) };
}

/** Link the account to its player record: the one already linked, else an unlinked one with the same email. */
export function claimPlayer(db: DB, userId: ID, email: string): { db: DB; playerId: ID | null } {
  const linked = db.players.find((p) => p.userId === userId);
  if (linked) return { db, playerId: linked.id };
  const match = [...db.players].reverse().find((p) => !p.userId && p.email && norm(p.email) === norm(email));
  if (!match) return { db, playerId: null };
  return { db: { ...db, players: db.players.map((p) => (p.id === match.id ? { ...p, userId } : p)) }, playerId: match.id };
}

export function inviteMember(db: DB, orgId: ID, email: string, role: Role, now = Date.now()): TeamResult {
  const e = norm(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { error: 'Enter a valid email address.' };
  const member = db.members.find((m) => m.orgId === orgId && norm(db.profiles.find((p) => p.id === m.userId)?.email ?? '') === e);
  if (member) return { error: 'That person is already on the team.' };
  if (db.orgInvites.some((i) => i.orgId === orgId && norm(i.email) === e)) return { error: 'That email has already been invited.' };
  return { db: { ...db, orgInvites: [...db.orgInvites, { id: uid('inv'), orgId, email: e, role, at: now }] } };
}

export function cancelInvite(db: DB, inviteId: ID): DB {
  return { ...db, orgInvites: db.orgInvites.filter((i) => i.id !== inviteId) };
}

const owners = (db: DB, orgId: ID) => db.members.filter((m) => m.orgId === orgId && m.role === 'owner');

/** Change a member's role. An organization always keeps at least one owner. */
export function setMemberRole(db: DB, orgId: ID, userId: ID, role: Role): TeamResult {
  const m = db.members.find((x) => x.orgId === orgId && x.userId === userId);
  if (!m) return { error: 'That person is not on the team.' };
  if (m.role === 'owner' && role !== 'owner' && owners(db, orgId).length === 1) return { error: 'Make someone else an owner first.' };
  return { db: { ...db, members: db.members.map((x) => (x === m ? { ...x, role } : x)) } };
}

export function removeMember(db: DB, orgId: ID, userId: ID): TeamResult {
  const m = db.members.find((x) => x.orgId === orgId && x.userId === userId);
  if (!m) return { error: 'That person is not on the team.' };
  if (m.role === 'owner' && owners(db, orgId).length === 1) return { error: 'The last owner can’t be removed.' };
  return { db: { ...db, members: db.members.filter((x) => x !== m) } };
}
