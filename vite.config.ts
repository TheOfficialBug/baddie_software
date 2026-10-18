import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const src = fileURLToPath(new URL('./src', import.meta.url));

/**
 * With Supabase configured every page loads its client at startup (sign-in and live data), but through import()
 * so the page can render first. Preloading the chunk downloads it in parallel with the app instead of after it.
 */
function preloadSupabase(enabled: boolean): Plugin {
  let base = '/';
  return {
    name: 'preload-supabase',
    apply: 'build',
    configResolved: (c) => void (base = c.base),
    transformIndexHtml: {
      order: 'post',
      handler: (_html, { bundle }) => {
        const chunk = enabled && Object.values(bundle ?? {}).find((c) => c.type === 'chunk' && c.name === 'supabase-js');
        return chunk
          ? [{ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: base + chunk.fileName }, injectTo: 'head' }]
          : [];
      },
    },
  };
}

// Modes:
//   (default)  production SPA in dist/ — deploy to any static host (see docs/DEPLOYMENT.md)
//   artifact   one self-contained HTML file in dist-artifact/ for sharing a preview link
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const artifact = mode === 'artifact';
  return {
    plugins: [react(), ...(artifact ? [viteSingleFile()] : [preloadSupabase(!!env.VITE_SUPABASE_URL)])],
    // Path routing needs an absolute base; hash routing and the single-file build work from any folder.
    base: artifact || env.VITE_ROUTER === 'hash' ? './' : env.VITE_BASE_PATH || '/',
    // Keep paths as given: some Windows app folders are virtualized and their resolved "real" path isn't readable.
    resolve: { alias: { '@': src }, preserveSymlinks: true },
    define: { __ARTIFACT__: JSON.stringify(artifact) },
    build: {
      outDir: artifact ? 'dist-artifact' : 'dist',
      target: 'es2022',
      sourcemap: !artifact,
      rollupOptions: artifact
        ? undefined
        : {
            output: {
              // Long-lived vendor chunks: app deploys don't invalidate cached libraries.
              // Libraries loaded with import() (Supabase, qrcode) keep their own chunks so the first page doesn't wait for them.
              manualChunks(id: string) {
                if (!id.includes('node_modules')) return undefined;
                if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) return 'react';
                if (id.includes('@hugeicons')) return 'icons';
                if (/[\\/]node_modules[\\/](@supabase|tslib|iceberg-js)[\\/]/.test(id)) return 'supabase-js';
                if (/[\\/]node_modules[\\/](qrcode|dijkstrajs|pngjs)[\\/]/.test(id)) return undefined;
                return 'vendor';
              },
            },
          },
    },
    server: { port: 5173 },
    preview: { port: 4173 },
    test: {
      projects: [
        {
          extends: true,
          // generous timeouts: the full suite runs in parallel and slow machines hit the 5 s default
          test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 30_000 },
        },
        {
          extends: true,
          test: {
            name: 'ui',
            environment: 'jsdom',
            include: ['src/**/*.test.tsx'],
            setupFiles: ['src/test/setup.ts'],
            testTimeout: 30_000,
          },
        },
        {
          extends: true,
          test: { name: 'db', environment: 'node', include: ['supabase/tests/**/*.test.ts'], testTimeout: 60_000 },
        },
      ],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/vite-env.d.ts', 'src/data/demo.ts'],
        reporter: ['text-summary', 'html'],
      },
    },
  };
});
