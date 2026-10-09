import type { SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/config/env';

let client: Promise<SupabaseClient> | null = null;

/**
 * The Supabase client, created on first use (the library is loaded only when Supabase is configured).
 * PKCE flow: email confirmation, password-reset and Google links come back to this site with a
 * one-time code that the client exchanges for a session (detectSessionInUrl).
 */
export function getSupabase(): Promise<SupabaseClient> {
  if (!env.supabase) return Promise.reject(new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'));
  const { url, anonKey } = env.supabase;
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, anonKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  );
  return client;
}
