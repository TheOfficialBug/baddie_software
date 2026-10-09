import { describe, expect, it } from 'vitest';

import { parseEnv } from '@/config/env';

import { appUrl } from '@/lib/url';

const ORIGIN = 'http://localhost:5173';

describe('appUrl', () => {
  it('builds path URLs for browser routing', () => {
    expect(appUrl('/admin/t/1/m/2', parseEnv({}), ORIGIN)).toBe('http://localhost:5173/admin/t/1/m/2');
  });

  it('builds hash URLs for hash routing, under the base path', () => {
    expect(appUrl('t/x', parseEnv({ VITE_ROUTER: 'hash', BASE_URL: '/smash/' }), ORIGIN)).toBe('http://localhost:5173/smash/#/t/x');
  });

  it('prefers the configured public site URL', () => {
    expect(appUrl('/t/x', parseEnv({ VITE_SITE_URL: 'https://smash.example.com' }), ORIGIN)).toBe('https://smash.example.com/t/x');
  });
});
