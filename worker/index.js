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
   * @returns {Promise<Response>}
   */
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/feed') {
      if (request.method !== 'GET') {
        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use GET for /api/feed.', {
          headers: { Allow: 'GET' },
        });
      }
      return handleFeedRequest(request);
    }

    if (pathname.startsWith('/api/')) {
      return errorResponse(404, 'NOT_FOUND', 'There is no API at this address.');
    }

    return new Response('Not found', { status: 404 });
  },
};
