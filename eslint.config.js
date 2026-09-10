import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: [
      '**/dist/**',
      '**/dist-electron/**',
      '**/build/**',
      '**/node_modules/**',
      '**/GeneratedGames/**',
      '**/Exports/**',
      '**/.claude/worktrees/**',
      '**/.venv*/**',
      '**/test-artifacts/**',
      '**/reports/**',
      '**/tools/redesign-audit/**',
      '**/scripts/build-sunnyland-v3-1.mjs',
      '**/scripts/create-industrial-transit-pack.mjs',
      'D*ProjectsMetroForgeForged*_debug_tmp.mjs',
    ],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
