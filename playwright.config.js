import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests: real browsers and real feeds, against a deployed copy of
 * Feedolio. Point SMOKE_URL at it, e.g. a Workers preview URL:
 *
 *   SMOKE_URL=https://<version>-feedolio.<account>.workers.dev pnpm test:smoke
 *
 * PW_CHANNEL picks an installed browser (msedge or chrome) instead of
 * Playwright's own Chromium, which `pnpm exec playwright install chromium`
 * downloads.
 */
const baseURL = process.env.SMOKE_URL;
if (!baseURL) throw new Error('Set SMOKE_URL to the address to test, e.g. a preview URL.');
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: 1,
  reporter: [['list']],
  use: { baseURL, channel, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], channel, viewport: { width: 390, height: 844 } },
    },
  ],
});
