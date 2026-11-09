import { cloudflareTest } from '@cloudflare/vitest-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}', 'worker/**/*.js'],
    },
    projects: [
      {
        // The real app in a simulated browser. Only the network (MSW) and,
        // when a test needs it, the clock are faked.
        plugins: [react()],
        test: {
          name: 'journeys',
          environment: 'jsdom',
          include: ['test/journeys/**/*.test.{js,jsx}'],
          setupFiles: ['test/setup/journeys.js'],
          // Workers run in UTC; so do the tests.
          env: { TZ: 'UTC' },
        },
      },
      {
        // Dense logic only: parsing, normalising, the address guard.
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/unit/**/*.test.js'],
          env: { TZ: 'UTC' },
        },
      },
      {
        // The Worker's HTTP contract, run inside Cloudflare's Workers runtime.
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
        test: {
          name: 'worker',
          include: ['test/worker/**/*.test.js'],
        },
      },
    ],
  },
});
