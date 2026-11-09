/**
 * Headers on every JSON response from the Worker. Static pages get their
 * security headers from public/_headers; Worker responses set their own.
 */
export const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * Edge caching for successful answers: fresh for 10 minutes, then served
 * stale while refreshing for up to an hour, or for up to a day if the
 * publisher fails. Never `s-maxage`: on Cloudflare it switches off both
 * stale-while-revalidate and stale-if-error.
 */
export const EDGE_CACHE = 'max-age=600, stale-while-revalidate=3600, stale-if-error=86400';

/**
 * A successful answer. Browsers revalidate every time (`no-cache`), so the
 * app's Refresh always reaches the edge cache.
 *
 * @param {unknown} body
 * @returns {Response}
 */
export function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      ...JSON_HEADERS,
      'Cache-Control': 'no-cache',
      'Cloudflare-CDN-Cache-Control': EDGE_CACHE,
    },
  });
}

/**
 * An error in the API's documented shape. Errors are never cached.
 *
 * @param {number} status
 * @param {string} code  Machine-readable, e.g. "INVALID_URL"
 * @param {string} message  Plain-English explanation
 * @param {{ upstreamStatus?: number, headers?: Record<string, string> }} [options]
 * @returns {Response}
 */
export function errorResponse(status, code, message, { upstreamStatus, headers } = {}) {
  /** @type {import('../../src/lib/types.js').FeedError} */
  const body = { error: { code, message } };
  if (upstreamStatus !== undefined) body.error.upstreamStatus = upstreamStatus;

  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store', ...headers },
  });
}
