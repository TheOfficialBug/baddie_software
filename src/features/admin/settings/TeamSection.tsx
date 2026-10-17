import { type FormEvent, useState } from 'react';

import { env } from '@/config/env';
import type { ID } from '@/engine/types';

import { fmtAgo } from '@/lib/format';

import { remoteTeam } from '@/data/remote';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';
import type { Role } from '@/data/types';

import { ROLE_HELP, ROLE_LABEL } from '@/auth/permissions';
import { useAccess } from '@/auth/useAccess';

import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { SectionHead } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';

const ROLES: Role[] = ['owner', 'admin', 'scorer'];

/** Tournament staff for the organization: owners invite people by email and change roles. */
export function TeamSection({ orgId }: { orgId: ID }) {
  const access = useAccess();
  const manage = access.can('manage_team', orgId);
  const org = useStore((s) => s.organizations.find((o) => o.id === orgId));
  const allMembers = useStore((s) => s.members);
  const profiles = useStore((s) => s.profiles);
  const allInvites = useStore((s) => s.orgInvites);
  const members = allMembers.filter((m) => m.orgId === orgId);
  const invites = allInvites.filter((i) => i.orgId === orgId);
  // checked and shown at once; with Supabase the database then makes the change (and has the final say)
  const store = useStore.getState();
  const inviteMember = (o: ID, e: string, r: Role) => {
    const err = store.inviteMember(o, e, r);
    if (!err && env.supabase) void remoteTeam.invite(o, e, r);
    return err;
  };
  const cancelInvite = (id: ID) => {
    store.cancelInvite(id);
    if (env.supabase) void remoteTeam.cancelInvite(id);
  };
  const setMemberRole = (o: ID, u: ID, r: Role) => {
    const err = store.setMemberRole(o, u, r);
    if (!err && env.supabase) void remoteTeam.setRole(o, u, r);
    return err;
  };
  const removeMember = (o: ID, u: ID) => {
    const err = store.removeMember(o, u);
    if (!err && env.supabase) void remoteTeam.remove(o, u);
    return err;
  };

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('scorer');
  const [error, setError] = useState<string | undefined>();

  const invite = (e: FormEvent) => {
    e.preventDefault();
    const err = inviteMember(orgId, email, role);
    setError(err ?? undefined);
    if (!err) {
      toast(`Invited ${email.trim()}`, { detail: `They join as ${ROLE_LABEL[role].toLowerCase()} when they sign in with this email.` });
      setEmail('');
    }
  };
  const report = (err: string | null, ok: string) => (err ? toast(err, { tone: 'error' }) : toast(ok));

  return (
    <section aria-labelledby="set-team">
      <SectionHead
        title={<span id="set-team">Team</span>}
        description={`People who can run ${org?.name ?? 'this organization'}'s tournaments.${manage ? '' : ' Only owners can change the team.'}`}
      />
      <div className="panel flex flex-col divide-y divide-line">
        <ul className="flex flex-col divide-y divide-line">
          {members.map((m) => {
            const p = profiles.find((x) => x.id === m.userId);
            const me = m.userId === access.user?.id;
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 p-4 sm:px-5">
                <Avatar name={p?.name ?? '?'} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {p?.name ?? 'Unknown'} {me && <span className="text-[12.5px] font-medium text-muted">(you)</span>}
                  </div>
                  <div className="truncate text-[13px] text-muted">{p?.email}</div>
                </div>
                {manage ? (
                  <div className="flex items-center gap-1.5">
                    <Select
                      aria-label={`Role for ${p?.name ?? 'member'}`}
                      value={m.role}
                      className="min-w-[124px] text-[14px]"
                      onChange={(e) => report(setMemberRole(orgId, m.userId, e.target.value as Role), 'Role updated')}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                    {!me && (
                      <IconButton
                        label={`Remove ${p?.name ?? 'member'} from the team`}
                        onClick={() => report(removeMember(orgId, m.userId), `${p?.name ?? 'Member'} removed`)}
                      >
                        <Icon name="delete" size={18} />
                      </IconButton>
                    )}
                  </div>
                ) : (
                  <span className="rounded-full bg-sunken px-2.5 py-1 text-[12.5px] font-semibold">{ROLE_LABEL[m.role]}</span>
                )}
              </li>
            );
          })}
          {invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 p-4 sm:px-5">
              <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-sunken text-muted">
                <Icon name="mail" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{i.email}</div>
                <div className="text-[13px] text-muted">
                  Invited as {ROLE_LABEL[i.role].toLowerCase()} · {fmtAgo(i.at)} · joins when they sign in
                </div>
              </div>
              {manage && (
                <Button variant="ghost" size="sm" onClick={() => cancelInvite(i.id)} className="touch:min-h-11">
                  Cancel invite
                </Button>
              )}
            </li>
          ))}
        </ul>
        {manage && (
          <form onSubmit={invite} noValidate className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-start sm:px-5">
            <Field label="Invite by email" error={error}>
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  aria-invalid={!!error || undefined}
                />
              )}
            </Field>
            <Field label="Role" hint={ROLE_HELP[role]}>
              {(id) => (
                <Select id={id} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button type="submit" variant="primary" icon={<Icon name="userAdd" size={18} />} className="sm:mt-[26px]">
              Invite
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
