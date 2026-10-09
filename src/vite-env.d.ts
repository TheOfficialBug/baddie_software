/// <reference types="vite/client" />

/** true in the single-file preview build (`npm run build:artifact`) */
declare const __ARTIFACT__: boolean;

interface ImportMetaEnv {
  readonly VITE_ROUTER?: 'browser' | 'hash';
  readonly VITE_BASE_PATH?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_AUTH_GOOGLE?: 'true' | 'false';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
