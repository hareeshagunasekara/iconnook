import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      // Security-critical package: docs/standards/testing.md requires ≥ 95% branch coverage.
      thresholds: { branches: 95, lines: 95, functions: 95, statements: 95 },
    },
  },
});
