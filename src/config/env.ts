/**
 * Typed access to build-time configuration (Vite `VITE_*` variables, see .env.example).
 * Read configuration through this module only, so every option is documented and validated in one place.
 */

export type RouterMode = 'browser' | 'hash' | 'memory';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface Env {
  /** `browser` needs the host to serve index.html for unknown paths; `hash` works on any static host. */
  routerMode: RouterMode;
  /** Public path the app is served from, always ending in "/". */
  basePath: string;
  /** Canonical public origin for shareable links and QR codes, e.g. https://smashboard.app (no trailing slash). */
  siteUrl: string;
  /** Supabase project, when configured. The app runs on local demo data without it. */
  supabase: SupabaseConfig | null;
  /** Show "Continue with Google" (Supabase: enable the Google provider first). Always on in demo mode. */
  authGoogle: boolean;
  /** The single-file preview build (`npm run build:artifact`). */
  isPreviewBuild: boolean;
  isProduction: boolean;
  /** Dev server: error details are shown on screen. */
  isDevelopment: boolean;
}

type RawEnv = Partial<
  Record<'VITE_ROUTER' | 'VITE_AUTH_GOOGLE' | 'VITE_SITE_URL' | 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY' | 'BASE_URL', string>
> & {
  PROD?: boolean;
  DEV?: boolean;
};

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const trimSlash = (s: string) => s.replace(/\/+$/, '');

function parseUrl(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${name} must be an absolute URL, got "${value}".`);
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new ConfigError(`${name} must use https (got ${url.protocol}//${url.host}).`);
  }
  return trimSlash(url.origin + url.pathname);
}

/** Pure parser so configuration rules can be unit-tested. */
export function parseEnv(raw: RawEnv, isPreviewBuild = false): Env {
  const router = raw.VITE_ROUTER?.trim() || 'browser';
  if (router !== 'browser' && router !== 'hash') throw new ConfigError(`VITE_ROUTER must be "browser" or "hash", got "${router}".`);

  const sbUrl = raw.VITE_SUPABASE_URL?.trim();
  const sbKey = raw.VITE_SUPABASE_ANON_KEY?.trim();
  if (!!sbUrl !== !!sbKey) throw new ConfigError('Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or neither.');

  const base = raw.BASE_URL || '/';
  return {
    routerMode: isPreviewBuild ? 'memory' : router,
    basePath: base.endsWith('/') ? base : `${base}/`,
    siteUrl: raw.VITE_SITE_URL?.trim() ? parseUrl('VITE_SITE_URL', raw.VITE_SITE_URL.trim()) : '',
    supabase: sbUrl && sbKey ? { url: parseUrl('VITE_SUPABASE_URL', sbUrl), anonKey: sbKey } : null,
    authGoogle: raw.VITE_AUTH_GOOGLE?.trim() === 'true',
    isPreviewBuild,
    isProduction: !!raw.PROD,
    isDevelopment: !!raw.DEV,
  };
}

export const env: Env = parseEnv(import.meta.env as RawEnv, typeof __ARTIFACT__ !== 'undefined' && __ARTIFACT__);

/**
 * Whether this build was made with Supabase settings, as a constant the bundler can see: code used only in demo
 * mode (the sample tournament) is left out of live builds. Same answer as `!!env.supabase` (parseEnv refuses half a config).
 */
export const LIVE_BUILD = !!import.meta.env.VITE_SUPABASE_URL?.trim();
