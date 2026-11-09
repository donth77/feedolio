import { http } from 'msw';
import worker from '../../worker/index.js';
import { savedAnswer, WEB } from '../fixtures/web.js';

/**
 * Network handlers shared by every journey test.
 *
 * Requests to our own /api/* run the real Worker code in-process, so a journey
 * covers the UI, the data layer and the endpoint together. The Worker's own
 * requests to publishers get the saved answers in test/fixtures/web.js. Any
 * other request fails the test.
 */
export const handlers = [
  http.all('/api/*', ({ request }) => worker.fetch(request)),
  ...Object.keys(WEB).map((url) => http.get(url, () => savedAnswer(url))),
];
