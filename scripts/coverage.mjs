/**
 * Coverage, one test project at a time.
 *
 * Each project checks the files it is responsible for. Vitest's single
 * combined run mis-merges files that run both in Node and in the Workers
 * runtime (it counts their branches twice), so the projects are measured
 * apart. Targets come from the engineering plan: 90% of lines and branches
 * for the Worker, 80% of lines for the app.
 */
import { startVitest } from 'vitest/node';

const UNIT_FILES = [
  'src/app/persistence.js',
  'src/features/ai/cache.js',
  'src/features/ai/errors.js',
  'src/features/ai/formatText.js',
  'src/features/ai/keys.js',
  'src/features/ai/prompts.js',
  'src/features/ai/providerInfo.js',
  'src/features/ai/providers/anthropic.js',
  'src/features/ai/providers/decision.js',
  'src/features/ai/providers/http.js',
  'src/features/ai/providers/openaiCompatible.js',
  'src/features/ai/router.js',
  'src/features/ai/rules/ruleEffects.js',
  'src/features/ai/rules/verdicts.js',
  'src/features/ai/storyText.js',
  'src/features/ai/usage.js',
  'src/features/story/cleanStoryHtml.js',
  'src/features/subscriptions/addFeed.js',
  'src/lib/beacons.js',
  'src/lib/hash.js',
  'src/lib/url.js',
  'worker/lib/discoverFeed.js',
  'worker/lib/normaliseFeed.js',
  'worker/lib/parser.js',
  'worker/lib/pickMainImage.js',
  'worker/lib/text.js',
  'worker/lib/urlGuard.js',
];

const WORKER_FILES = [
  'worker/index.js',
  'worker/lib/auth.js',
  'worker/lib/errors.js',
  'worker/lib/handleFeedRequest.js',
  'worker/lib/responses.js',
  'worker/lib/safeFetch.js',
];

const RUNS = [
  { project: 'unit', include: UNIT_FILES, thresholds: { lines: 90, branches: 90 } },
  { project: 'worker', include: WORKER_FILES, thresholds: { lines: 90, branches: 90 } },
  {
    project: 'journeys',
    include: ['src/**/*.{js,jsx}'],
    exclude: [...UNIT_FILES, 'src/main.jsx', 'src/lib/types.js', 'src/features/ai/types.js'],
    thresholds: { lines: 80 },
  },
];

let failed = false;
for (const { project, include, exclude = [], thresholds } of RUNS) {
  const vitest = await startVitest([], {
    run: true,
    project: [project],
    coverage: {
      enabled: true,
      include,
      exclude,
      thresholds,
      reportsDirectory: `coverage/${project}`,
    },
  });
  await vitest?.close();
  if (!vitest || process.exitCode) failed = true;
}
process.exit(failed ? 1 : 0);
