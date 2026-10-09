import { describe, expect, it } from 'vitest';

import { ConfigError, parseEnv } from '@/config/env';

describe('parseEnv', () => {
  it('defaults to path routing at the domain root with no backend', () => {
    expect(parseEnv({})).toEqual({
      routerMode: 'browser',
      basePath: '/',
      siteUrl: '',
      supabase: null,
      authGoogle: false,
      isPreviewBuild: false,
      isProduction: false,
      isDevelopment: false,
    });
  });

  it('uses in-memory routing for the single-file preview build', () => {
    expect(parseEnv({ VITE_ROUTER: 'browser' }, true).routerMode).toBe('memory');
  });

  it('accepts hash routing and normalises the base path and site URL', () => {
    const env = parseEnv({ VITE_ROUTER: 'hash', BASE_URL: '/smash', VITE_SITE_URL: 'https://smash.example.com/' });
    expect(env.routerMode).toBe('hash');
    expect(env.basePath).toBe('/smash/');
    expect(env.siteUrl).toBe('https://smash.example.com');
  });

  it('reads the Supabase project when both values are set', () => {
    const env = parseEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-anon-key' });
    expect(env.supabase).toEqual({ url: 'https://abc.supabase.co', anonKey: 'public-anon-key' });
  });

  it('rejects incomplete or unsafe configuration', () => {
    expect(() => parseEnv({ VITE_ROUTER: 'memory' as never })).toThrow(ConfigError);
    expect(() => parseEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co' })).toThrow(/both/);
    expect(() => parseEnv({ VITE_SUPABASE_URL: 'http://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' })).toThrow(/https/);
    expect(() => parseEnv({ VITE_SITE_URL: 'smash.example.com' })).toThrow(/absolute URL/);
  });

  it('allows plain http for a local Supabase', () => {
    const env = parseEnv({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'k' });
    expect(env.supabase?.url).toBe('http://127.0.0.1:54321');
  });
});
