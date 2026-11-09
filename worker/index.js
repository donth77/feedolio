import { handleAuthRequest } from './lib/auth.js';
import { handleFeedRequest } from './lib/handleFeedRequest.js';
import { errorResponse } from './lib/responses.js';

/**
 * The Worker. Static assets (the built app) are served by Cloudflare before
 * this runs; only /api/* requests, and asset misses that aren't page
 * navigations, reach it.
 */
export default {
  /**
   * @param {Request} request
   * @param {import('./lib/auth.js').AuthEnv} [env]
   * @param {import('./lib/auth.js').WaitUntil} [ctx]
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/feed') {
      if (request.method !== 'GET') {
        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use GET for /api/feed.', {
          headers: { Allow: 'GET' },
        });
      }
      return handleFeedRequest(request);
    }

    if (pathname.startsWith('/api/auth/')) return handleAuthRequest(request, env ?? {}, ctx);

    if (pathname.startsWith('/api/')) {
      return errorResponse(404, 'NOT_FOUND', 'There is no API at this address.');
    }

    return new Response('Not found', { status: 404 });
  },
};
