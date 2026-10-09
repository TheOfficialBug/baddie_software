import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';

import { authActions } from '@/auth/authStore';
import { loginPath } from '@/auth/redirects';
import { useAccess } from '@/auth/useAccess';

import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PageLoading } from '@/components/ui/PageLoading';

/** Signed-in accounts only; everyone else goes to sign in and comes back afterwards. */
export function RequireAuth() {
  const { status } = useAccess();
  const loc = useLocation();
  if (status === 'loading') return <PageLoading label="Checking your sign-in" />;
  if (status === 'signedOut') return <Navigate to={loginPath(loc.pathname + loc.search)} replace />;
  return <Outlet />;
}

/** Organizer desk: staff of at least one organization. Per-tournament roles are checked inside the desk. */
export function RequireOrganizer() {
  const { status, isOrganizer, user } = useAccess();
  const loc = useLocation();
  if (status === 'loading') return <PageLoading label="Checking your access" />;
  if (status === 'signedOut') return <Navigate to={loginPath(loc.pathname + loc.search)} replace />;
  if (!isOrganizer) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <NoAccess
          icon="shield"
          title="The organizer desk is for tournament staff"
          body={
            <>
              You're signed in as <strong className="text-fg">{user?.email}</strong>. To help run a tournament, ask its owner to add this
              email to the team, then sign in again.
            </>
          }
          actions={
            <>
              <ButtonLink to="/me" variant="primary">
                My matches
              </ButtonLink>
              <Button variant="secondary" onClick={() => void authActions.signOut()} icon={<Icon name="logout" size={18} />}>
                Use another account
              </Button>
            </>
          }
        />
      </div>
    );
  }
  return <Outlet />;
}

/** Explains why something isn't available and what to do instead. */
export function NoAccess({
  icon = 'lock',
  title,
  body,
  actions,
}: {
  icon?: IconName;
  title: string;
  body: ReactNode;
  actions?: ReactNode;
}) {
  useDocumentTitle('No access');
  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-center gap-3 py-12 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-sunken text-muted">
        <Icon name={icon} size={28} />
      </span>
      <h1 className="mt-2 font-display text-[clamp(24px,4vw,30px)] font-extrabold leading-tight">{title}</h1>
      <p className="text-[15px] text-muted">{body}</p>
      {actions && <div className="mt-3 flex w-full flex-col gap-2.5 xs:w-auto xs:flex-row">{actions}</div>}
    </div>
  );
}
