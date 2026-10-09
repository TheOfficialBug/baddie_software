import '@/styles/index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';

import { initMonitoring } from '@/lib/monitoring';

import { startCrossTabSync } from '@/data/sync';

import { initAuth } from '@/auth/authStore';

import { createAppRouter } from '@/app/router';

initMonitoring();
// restore the session (or demo account) while the first page loads
void initAuth();
// other open tabs see the desk's changes immediately
startCrossTabSync();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={createAppRouter()} />
  </StrictMode>,
);
