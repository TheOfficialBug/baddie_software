// Who may do what at the organizer desk. Mirrors the row level security in
// supabase/migrations (can_manage = owner/admin, can_score = owner/admin/scorer),
// so the UI never offers an action the database would refuse.
import type { ID } from '@/engine/types';

import type { Role } from '@/data/types';

import type { Access } from '@/auth/types';

export type Capability =
  | 'run_match_day' // dashboard, courts, live scoring, players, slips, notifications
  | 'manage_entries'
  | 'manage_draws'
  | 'manage_settings'
  | 'create_tournament'
  | 'manage_team';

const ALLOWED: Record<Capability, Role[]> = {
  run_match_day: ['owner', 'admin', 'scorer'],
  manage_entries: ['owner', 'admin'],
  manage_draws: ['owner', 'admin'],
  manage_settings: ['owner', 'admin'],
  create_tournament: ['owner', 'admin'],
  manage_team: ['owner'],
};

/** Route metadata: the capability an organizer page needs (checked against the tournament's organization). */
export interface RouteHandle {
  cap?: Capability;
}

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', scorer: 'Scorer' };

export const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including the team',
  admin: 'Tournaments, entries, draws and match day',
  scorer: 'Match day only: courts, scores, notifications',
};

export function can(role: Role | null | undefined, cap: Capability): boolean {
  return !!role && ALLOWED[cap].includes(role);
}

export function roleIn(access: Access, orgId: ID | undefined): Role | null {
  return access.memberships.find((m) => m.orgId === orgId)?.role ?? null;
}

/** Organizations where the account can create tournaments. */
export function orgsWhere(access: Access, cap: Capability): ID[] {
  return access.memberships.filter((m) => can(m.role, cap)).map((m) => m.orgId);
}
