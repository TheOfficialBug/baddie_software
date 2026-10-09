import { env } from '@/config/env';

/**
 * Absolute URL for an in-app route, for QR codes and share links.
 * Honours the router mode (hash vs. path URLs), the base path and VITE_SITE_URL.
 */
export function appUrl(path: string, config = env, origin = typeof window === 'undefined' ? '' : window.location.origin): string {
  const site = config.siteUrl || origin;
  const base = config.basePath.replace(/\/$/, '');
  const route = path.startsWith('/') ? path : `/${path}`;
  return config.routerMode === 'hash' ? `${site}${base}/#${route}` : `${site}${base}${route}`;
}
