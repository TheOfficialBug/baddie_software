import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const src = fileURLToPath(new URL('./src', import.meta.url));

// Modes:
//   (default)  production SPA in dist/ — deploy to any static host (see docs/DEPLOYMENT.md)
//   artifact   one self-contained HTML file in dist-artifact/ for sharing a preview link
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const artifact = mode === 'artifact';
  return {
    plugins: [react(), ...(artifact ? [viteSingleFile()] : [])],
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
              manualChunks(id: string) {
                if (!id.includes('node_modules')) return undefined;
                if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) return 'react';
                if (id.includes('@hugeicons')) return 'icons';
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
