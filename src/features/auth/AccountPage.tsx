import { type FormEvent, type ReactNode, useState } from 'react';
import { useNavigate } from 'react-router';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';

import { useLookup } from '@/data/lookup';
import { useStore } from '@/data/store';
import { toast } from '@/data/toast';

import { authActions } from '@/auth/authStore';
import { ROLE_HELP, ROLE_LABEL } from '@/auth/permissions';
import { AuthError, MIN_PASSWORD, passwordProblem } from '@/auth/types';
import { useAccess } from '@/auth/useAccess';

import { LevelBars } from '@/components/tournament/LevelPicker';
import { levelInfo } from '@/components/tournament/skillLevels';
import { Avatar } from '@/components/ui/Avatar';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

import { PasswordInput } from '@/features/auth/AuthLayout';

const messageOf = (e: unknown) => (e instanceof AuthError ? e.message : 'Something went wrong. Try again.');

function Section({ icon, title, description, children }: { icon: IconName; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel grid gap-4 p-4 sm:p-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
      <div className="flex items-start gap-3 md:flex-col md:gap-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunken text-muted">
          <Icon name={icon} size={20} />
        </span>
        <div>
          <h2 className="font-display text-[18px] font-bold">{title}</h2>
          {description && <p className="mt-0.5 text-[13.5px] text-muted">{description}</p>}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function NameForm({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const changed = name.trim() !== initial;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await authActions.updateName(name);
      toast('Name updated');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="Name" error={error} className="flex-1">
        {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
      </Field>
      <Button type="submit" disabled={!changed || busy} className="sm:mb-[22px]">
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}

function PasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = passwordProblem(password);
  const mismatch = confirm !== password ? 'The passwords don’t match.' : undefined;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem || mismatch) return;
    setBusy(true);
    setError(null);
    try {
      await authActions.updatePassword(password);
      setPassword('');
      setConfirm('');
      setTouched(false);
      toast('Password changed');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
      {error && (
        <p role="alert" className="text-[14px] font-medium text-live sm:col-span-2">
          {error}
        </p>
      )}
      <Field
        label="New password"
        hint={`At least ${MIN_PASSWORD} characters, with a number or symbol.`}
        error={touched ? (problem ?? undefined) : undefined}
      >
        {(id) => (
          <PasswordInput
            id={id}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            invalid={touched && !!problem}
          />
        )}
      </Field>
      <Field label="Repeat new password" error={touched ? mismatch : undefined}>
        {(id) => (
          <PasswordInput
            id={id}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            invalid={touched && !!mismatch}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" disabled={busy || !password} className="justify-self-start sm:col-span-2">
        {busy ? 'Saving…' : 'Change password'}
      </Button>
    </form>
  );
}

/** Account settings: profile, password, linked player, team roles, appearance and sign-out. */
export function AccountPage() {
  useDocumentTitle('Account settings');
  const nav = useNavigate();
  const lk = useLookup();
  const access = useAccess();
  const organizations = useStore((s) => s.organizations);
  const user = access.user;
  if (!user) return null; // the route requires sign-in
  const player = lk.player(access.playerId ?? undefined);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header className="flex items-center gap-4">
        <Avatar name={user.name} size={60} />
        <div className="min-w-0">
          <div className="eyebrow">Account settings</div>
          <h1 className="truncate font-display text-[clamp(26px,4vw,36px)] font-extrabold leading-tight">{user.name}</h1>
          <p className="truncate text-[14px] text-muted">{user.email}</p>
        </div>
      </header>

      <Section icon="account" title="Profile" description="Shown to organizers and on your entries.">
        <div className="flex flex-col gap-4">
          <NameForm key={user.name} initial={user.name} />
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-semibold">Email</span>
            <span className="flex min-h-11 items-center rounded-xl bg-sunken px-3.5 text-[15px] text-muted">{user.email}</span>
          </div>
        </div>
      </Section>

      <Section
        icon="lock"
        title="Sign-in & security"
        description={user.provider === 'google' ? 'You sign in with Google.' : 'You sign in with your email and password.'}
      >
        {user.provider === 'google' ? (
          <div className="flex flex-col gap-2 text-[14.5px] text-muted">
            <p>Your Google account handles your password and two-step verification.</p>
            <p>
              Want a password too? Use{' '}
              <button
                type="button"
                className="font-semibold text-fg underline underline-offset-2"
                onClick={() => nav(`/forgot-password?email=${encodeURIComponent(user.email)}`)}
              >
                set a password
              </button>{' '}
              and we'll email you a link.
            </p>
          </div>
        ) : (
          <PasswordForm />
        )}
      </Section>

      <Section icon="badminton" title="Player profile" description="Your entries, matches and results.">
        {player ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={player.name} size={44} />
              <div>
                <div className="font-semibold">{player.name}</div>
                <div className="flex items-center gap-2 text-[13px] text-muted">
                  {player.club}
                  <span aria-hidden>·</span>
                  <LevelBars n={levelInfo(player.level).bars} className="h-3 text-fg" /> {levelInfo(player.level).title}
                </div>
              </div>
            </div>
            <ButtonLink to="/me" variant="secondary" icon={<Icon name="calendar" size={18} />}>
              My matches
            </ButtonLink>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-[14.5px] text-muted">
            <p>No player profile yet. Enter a tournament with this account and it's created for you.</p>
            <ButtonLink to="/" variant="secondary" className="self-start">
              Find a tournament
            </ButtonLink>
          </div>
        )}
      </Section>

      <Section icon="organization" title="Tournament teams" description="Where you help run tournaments.">
        {access.memberships.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {access.memberships.map((m) => (
              <li key={m.orgId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1 font-semibold">{organizations.find((o) => o.id === m.orgId)?.name ?? 'Organization'}</span>
                <span className="rounded-full bg-sunken px-2.5 py-1 text-[12.5px] font-semibold">{ROLE_LABEL[m.role]}</span>
                <span className="w-full text-[13px] text-muted">{ROLE_HELP[m.role]}</span>
              </li>
            ))}
            <li className="pt-3">
              <ButtonLink to="/admin" variant="secondary" icon={<Icon name="dashboard" size={18} />}>
                Open the organizer desk
              </ButtonLink>
            </li>
          </ul>
        ) : (
          <p className="text-[14.5px] text-muted">
            You're not on a tournament team. If you help run one, ask its owner to invite <strong className="text-fg">{user.email}</strong>.
          </p>
        )}
      </Section>

      <Section icon="sun" title="Appearance" description="Applies on this device.">
        <ThemeToggle labels className="w-full sm:w-auto" />
      </Section>

      <div className="flex justify-end">
        <Button
          variant="secondary"
          icon={<Icon name="logout" size={18} />}
          onClick={async () => {
            await authActions.signOut();
            toast('Signed out');
            nav('/', { replace: true });
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
