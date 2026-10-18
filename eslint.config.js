import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // local/: machine-only tooling and real tournament files (git-ignored)
  { ignores: ['dist', 'dist-artifact', 'coverage', 'node_modules', 'local'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, jsxA11y.flatConfigs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh, 'simple-import-sort': simpleImportSort },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'simple-import-sort/imports': [
        'error',
        // packages, then app modules by layer (config → engine → lib/hooks → data → components → features), then relative
        {
          groups: [
            ['^\\u0000'],
            ['^node:', '^@?\\w'],
            ['^@/(config|engine)(/|$)'],
            ['^@/(lib|hooks)(/|$)'],
            ['^@/data(/|$)'],
            ['^@/auth(/|$)'],
            ['^@/components(/|$)'],
            ['^@/(features|app)(/|$)'],
            ['^\\.'],
          ],
        },
      ],
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // Pure domain code: no React, no browser, no app layers.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*', '@/*'], message: 'The engine is pure TypeScript: import only from ./ within src/engine.' },
          ],
        },
      ],
    },
  },
  {
    // Shared building blocks must not depend on screens.
    files: ['src/components/**/*.{ts,tsx}', 'src/data/**/*.ts', 'src/lib/**/*.ts', 'src/hooks/**/*.ts', 'src/auth/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@/features/*', '@/app/*'], message: 'Shared code must not import from features or app.' }] },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**', 'supabase/tests/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'react-refresh/only-export-components': 'off', '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['*.{js,ts}', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
);
