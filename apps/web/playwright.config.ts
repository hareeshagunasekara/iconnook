import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

/**
 * E2E + accessibility tests against the production builds of the API and the website
 * (run `pnpm build` first). Data: the CC0 fixture set from `pnpm db:seed` + a search reindex.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'node --env-file-if-exists=../../.env ../api/dist/main.js',
      url: 'http://localhost:8787/healthz',
      reuseExistingServer: !CI,
      env: {
        LOG_LEVEL: 'warn',
        RATE_LIMIT_PER_MINUTE: '100000',
        RATE_LIMIT_RENDER_PER_MINUTE: '100000',
      },
    },
    {
      // Builds ZIP packs / sprites for the collection journey.
      command: 'node --env-file-if-exists=../../.env ../worker/dist/main.js',
      url: 'http://localhost:8788/healthz',
      reuseExistingServer: !CI,
      // Worker logs go to the test output, so CI failures in background jobs are visible.
      stdout: 'pipe',
      stderr: 'pipe',
      env: { LOG_LEVEL: 'info', DOWNLOADS_FLUSH_EVERY_MS: '1000' },
    },
    {
      command: 'node dist/server/entry.mjs',
      url: 'http://localhost:4321/',
      reuseExistingServer: !CI,
      env: { HOST: '127.0.0.1', PORT: '4321', API_INTERNAL_URL: 'http://localhost:8787' },
    },
  ],
});
