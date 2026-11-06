import { fileURLToPath } from 'node:url';

import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  test: {
    // Local runs read DATABASE_URL from the repo's .env; CI sets it directly (process.env wins).
    env: loadEnv('test', repoRoot, ''),
    // Integration tests create and migrate a real database per file.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
