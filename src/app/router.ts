import { createBrowserRouter, createHashRouter, createMemoryRouter } from 'react-router';

import { type Env, env } from '@/config/env';

import { routes } from '@/app/routes';

/** Build the router for the configured mode (see VITE_ROUTER in .env.example). */
export function createAppRouter(config: Pick<Env, 'routerMode' | 'basePath'> = env) {
  switch (config.routerMode) {
    case 'memory':
      return createMemoryRouter(routes);
    case 'hash':
      return createHashRouter(routes);
    default:
      return createBrowserRouter(routes, { basename: config.basePath.replace(/\/$/, '') || '/' });
  }
}
