import { Outlet, ScrollRestoration, useNavigation } from 'react-router';

import { cn } from '@/lib/cn';

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

/** Wraps every route: toasts, scroll restoration and the loading bar. */
export function RootLayout() {
  return (
    <>
      <NavigationProgress />
      <Outlet />
      <Toaster />
      <ScrollRestoration />
    </>
  );
}

/** Shown while the first page's code loads. */
export const AppLoading = () => <PageLoading />;
