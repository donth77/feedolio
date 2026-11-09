import { http } from 'msw';
import { aiHandlers } from '../fixtures/ai.js';
import { githubHandlers } from '../fixtures/github.js';
import { savedAnswer, WEB } from '../fixtures/web.js';
import { callWorker } from './worker.js';

/**
 * Network handlers shared by every journey test.
 *
 * Requests to our own /api/* run the real Worker code in-process, so a journey
 * covers the UI, the data layer and the endpoint together (see worker.js for
 * its settings and cookies). The Worker's own requests to publishers get the
 * saved answers in test/fixtures/web.js, GitHub answers as in
 * test/fixtures/github.js, and AI providers answer as recorded in
 * test/fixtures/ai.js. Any other request fails the test.
 */
export const handlers = [
  http.all('/api/*', ({ request }) => callWorker(request)),
  ...Object.keys(WEB).map((url) => http.get(url, () => savedAnswer(url))),
  ...githubHandlers,
  ...aiHandlers,
];
