import '@/styles/index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';

import { env } from '@/config/env';

import { initMonitoring } from '@/lib/monitoring';

import { startRemoteSync } from '@/data/remote';
import { startCrossTabSync } from '@/data/sync';

import { initAuth } from '@/auth/authStore';

import { createAppRouter } from '@/app/router';

initMonitoring();
// restore the session (or demo account) while the first page loads
void initAuth();
// live data from Supabase on every device; in demo mode, other open tabs see the desk's changes immediately
if (env.supabase) startRemoteSync();
else startCrossTabSync();
// `npm run dev:player`: the public pages on a simulated match day (dev server only, never in a build)
if (import.meta.env.DEV && import.meta.env.MODE === 'player') void import('@/dev/playerPreview').then((m) => m.startPlayerPreview());

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={createAppRouter()} />
  </StrictMode>,
);
