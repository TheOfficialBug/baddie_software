import { useMemo } from 'react';

import type { ID } from '@/engine/types';

import { useStore } from '@/data/store';
import type { Role } from '@/data/types';

import { useAuth } from '@/auth/authStore';
import { can, type Capability, roleIn } from '@/auth/permissions';
import type { Access } from '@/auth/types';

export interface AccessInfo extends Access {
  status: ReturnType<typeof useAuth.getState>['status'];
  user: ReturnType<typeof useAuth.getState>['user'];
  /** Staff of at least one organization. */
  isOrganizer: boolean;
  roleIn: (orgId: ID | undefined) => Role | null;
  can: (cap: Capability, orgId: ID | undefined) => boolean;
}

/**
 * The signed-in account's roles and player record. In demo mode they're read live from the
 * local data (so a new team member or a fresh registration shows up at once); with Supabase
 * they come from the database at sign-in.
 */
export function useAccess(): AccessInfo {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const loaded = useAuth((s) => s.access);
  const demo = useAuth((s) => s.backend?.kind !== 'supabase');
  const members = useStore((s) => s.members);
  const players = useStore((s) => s.players);

  return useMemo(() => {
    const access: Access =
      demo && user
        ? {
            memberships: members.filter((m) => m.userId === user.id).map((m) => ({ orgId: m.orgId, role: m.role })),
            playerId: players.find((p) => p.userId === user.id)?.id ?? null,
          }
        : user
          ? loaded
          : { memberships: [], playerId: null };
    return {
      ...access,
      status,
      user,
      isOrganizer: access.memberships.length > 0,
      roleIn: (orgId) => roleIn(access, orgId),
      can: (cap, orgId) => can(roleIn(access, orgId), cap),
    };
  }, [status, user, loaded, demo, members, players]);
}
