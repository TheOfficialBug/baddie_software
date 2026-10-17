import type { ReactNode } from 'react';
import { Outlet, ScrollRestoration, useNavigation } from 'react-router';

import { env } from '@/config/env';

import { cn } from '@/lib/cn';

import { reload, useRemote } from '@/data/remote';

import { Button } from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/PageLoading';
import { Toaster } from '@/components/ui/Toaster';

/** Thin progress bar while the next page's code is loading. */
function NavigationProgress() {
  const busy = useNavigation().state !== 'idle';
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[80] h-0.5 origin-left bg-primary transition-[transform,opacity] duration-500 ease-out',
        busy ? 'scale-x-75 opacity-100' : 'scale-x-100 opacity-0',
      )}
    />
  );
}

/** With Supabase: wait for the first load of the live data (pages would otherwise say "not found"). */
function LiveData({ children }: { children: ReactNode }) {
  const status = useRemote((s) => s.status);
  const error = useRemote((s) => s.error);
  if (!env.supabase || status === 'ready') return <>{children}</>;
  if (status === 'error')
    return (
      <div role="alert" className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-[15px] text-muted">{error}</p>
        <Button onClick={() => void reload()}>Try again</Button>
      </div>
    );
  return <PageLoading />;
}

/** Wraps every route: toasts, scroll restoration and the loading bar. */
export function RootLayout() {
  return (
    <>
      <NavigationProgress />
      <LiveData>
        <Outlet />
      </LiveData>
      <Toaster />
      <ScrollRestoration />
    </>
  );
}

/** Shown while the first page's code loads. */
export const AppLoading = () => <PageLoading />;
