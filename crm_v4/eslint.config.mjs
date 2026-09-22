import tseslint from 'typescript-eslint'
import nextVitals from 'eslint-config-next/core-web-vitals'

const frontendFiles = ['frontend/**/*.{ts,tsx}']

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      'backend/src/db/migrations/**',
      'frontend/next-env.d.ts',
      '.specify/**',
      '.claude/**',
    ],
  },
  ...tseslint.configs.strict,
  ...nextVitals.map((config) => ({ ...config, files: frontendFiles })),
  {
    settings: { next: { rootDir: 'frontend' } },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      // noUncheckedIndexedAccess makes every index access optional; `!` marks the spots where the
      // value is guaranteed (e.g. `.returning()` of an insert). Banning it would push toward casts.
      '@typescript-eslint/no-non-null-assertion': 'off',
      'max-lines-per-function': ['warn', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-depth': ['warn', 3],
    },
  },
  {
    // Tests and React components with JSX naturally exceed the function length heuristic.
    files: ['**/*.test.{ts,tsx}', 'frontend/**/*.tsx'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    files: ['frontend/src/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },
)
