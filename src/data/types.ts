// Shape of the app's data snapshot. Domain entities live in '@/engine/types'; these are app-level records.
import type { Entry, Group, ID, Match, MatchUpdate, PendingPartner, Player, SkillLevel, Stage, TEvent, Tournament } from '@/engine/types';

export interface Registration {
  id: ID;
  tournamentId: ID;
  playerId: ID;
  entryIds: ID[];
  total: number;
  at: number;
}

/** One event chosen at registration. */
export interface RegistrationPick {
  eventId: ID;
  /** Registered partner (doubles). */
  partnerId?: ID;
  /** Each player's level for this event, registrant first. */
  levels?: SkillLevel[];
  /** Partner named by the registrant who is not registered yet. */
  pendingPartner?: PendingPartner;
}

export type NoticeKind = 'call' | 'announcement' | 'delay' | 'draw' | 'result';
export interface Notice {
  id: ID;
  tournamentId: ID;
  at: number;
  kind: NoticeKind;
  title: string;
  body?: string;
  /** who receives it: everyone following the tournament, one event's players, or specific players */
  audience: 'all' | 'event' | 'players';
  eventId?: ID;
  playerIds?: ID[];
  channels: ('app' | 'sms' | 'email')[];
}

/** Staff role in an organization: owners also manage the team; scorers run courts and scores only. */
export type Role = 'owner' | 'admin' | 'scorer';

export interface Organization {
  id: ID;
  name: string;
  slug: string;
}

/** Public account details (mirrors `profiles` in the database). */
export interface Profile {
  id: ID;
  name: string;
  email: string;
}

export interface Membership {
  orgId: ID;
  userId: ID;
  role: Role;
}

/** Someone invited to an organization's staff; becomes a member when they sign in with that email. */
export interface OrgInvite {
  id: ID;
  orgId: ID;
  email: string;
  role: Role;
  at: number;
}

export interface DB {
  version: number;
  tournaments: Tournament[];
  players: Player[];
  events: TEvent[];
  entries: Entry[];
  stages: Stage[];
  groups: Group[];
  matches: Match[];
  updates: MatchUpdate[];
  registrations: Registration[];
  notices: Notice[];
  organizations: Organization[];
  profiles: Profile[];
  members: Membership[];
  orgInvites: OrgInvite[];
}

export const emptyDB = (): DB => ({
  version: 1,
  tournaments: [],
  players: [],
  events: [],
  entries: [],
  stages: [],
  groups: [],
  matches: [],
  updates: [],
  registrations: [],
  notices: [],
  organizations: [],
  profiles: [],
  members: [],
  orgInvites: [],
});
