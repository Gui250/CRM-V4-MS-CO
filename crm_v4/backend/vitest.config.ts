import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The first PGlite test per worker boots Postgres (WASM) and runs migrations.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/models/**', 'src/controllers/**'],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 80 },
    },
  },
})
