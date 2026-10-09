import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { env } from '@/config/env';

import { isChunkLoadError, reportError } from '@/lib/monitoring';
import { safeSessionStorage } from '@/lib/storage';

import { NotFound } from '@/components/NotFound';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

const RELOADED_KEY = 'smashboard.chunkReload';

/** Error screen for anything that throws while loading or rendering a route. */
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const staleBuild = isChunkLoadError(error);

  useEffect(() => {
    if (notFound) return;
    // A new version was deployed and this tab asks for files that no longer exist: reload once.
    if (staleBuild && !safeSessionStorage.get(RELOADED_KEY)) {
      safeSessionStorage.set(RELOADED_KEY, '1');
      window.location.reload();
      return;
    }
    reportError(error, { source: 'route' });
  }, [error, notFound, staleBuild]);

  if (notFound) {
    return (
      <div className="px-4">
        <NotFound />
      </div>
    );
  }

  return (
    <div role="alert" className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-3 px-5 py-14 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-live-soft text-live">
        <Icon name="alert" size={28} />
      </span>
      <div className="eyebrow mt-2">{staleBuild ? 'Update available' : 'Something went wrong'}</div>
      <h1 className="font-display text-[clamp(26px,4vw,34px)] font-extrabold leading-[1.05]">
        {staleBuild ? 'A new version is ready' : 'This page could not load'}
      </h1>
      <p className="max-w-sm text-[15px] text-muted">
        {staleBuild
          ? 'Reload to get the latest version of the app.'
          : 'Your data is safe. Reload the page, or go back to the list of tournaments.'}
      </p>
      {env.isDevelopment && error instanceof Error && (
        <pre className="mt-2 max-h-48 w-full overflow-auto rounded-xl bg-sunken p-3 text-left text-[12px] text-muted">
          {error.stack ?? error.message}
        </pre>
      )}
      <div className="mt-3 flex w-full flex-col gap-2.5 xs:w-auto xs:flex-row">
        <Button variant="primary" icon={<Icon name="refresh" size={18} />} onClick={() => window.location.reload()}>
          Reload
        </Button>
        <ButtonLink to="/" variant="secondary">
          Go to tournaments
        </ButtonLink>
      </div>
    </div>
  );
}
