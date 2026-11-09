import { findFeedLinks } from './discoverFeed.js';
import { FeedError } from './errors.js';
import { normaliseFeed } from './normaliseFeed.js';
import { readFeedDocument } from './parser.js';
import { errorResponse, jsonResponse } from './responses.js';
import { createBudget, fetchDocument } from './safeFetch.js';
import { parseFeedUrl } from './urlGuard.js';

/**
 * GET /api/feed?url=<feed or website URL>
 *
 * - A feed address returns the feed as a FeedResponse.
 * - A web page is searched for feed links: one feed is fetched and returned,
 *   several return `{ choices }`, none is NO_FEED_FOUND. Discovery happens
 *   once: a discovered link that leads to another page is NOT_A_FEED.
 * - Failures return `{ error: { code, message, upstreamStatus? } }`.
 *
 * Uses only standard web APIs, so the same function runs in the Workers
 * runtime and in Node (the journey tests hand /api/feed requests to it).
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleFeedRequest(request) {
  const budget = createBudget();
  try {
    const target = parseFeedUrl(new URL(request.url).searchParams.get('url'));
    const first = await fetchDocument(target, budget);
    if (first.kind === 'feed') return jsonResponse(toFeedResponse(first, target));

    const links = findFeedLinks(first.text, first.url);
    if (links.length === 0) {
      throw new FeedError(
        'NO_FEED_FOUND',
        'We couldn’t find a feed at that address. Try the site’s homepage, or a link that ends in /feed or /rss.',
      );
    }
    if (links.length > 1) return jsonResponse({ choices: links });

    const feedUrl = new URL(links[0].url);
    const feed = await fetchDocument(feedUrl, budget);
    if (feed.kind !== 'feed') {
      throw new FeedError('NOT_A_FEED', 'The feed link on that page leads to another web page.');
    }
    return jsonResponse(toFeedResponse(feed, feedUrl));
  } catch (error) {
    if (error instanceof FeedError) {
      return errorResponse(error.status, error.code, error.message, {
        upstreamStatus: error.upstreamStatus,
      });
    }
    console.error('Unexpected /api/feed failure', error);
    return errorResponse(500, 'INTERNAL_ERROR', 'Something went wrong while reading that feed.');
  } finally {
    budget.dispose();
  }
}

/**
 * @param {import('./safeFetch.js').UpstreamDocument} document
 * @param {URL} feedUrl  The address the feed was asked for, before redirects
 */
function toFeedResponse(document, feedUrl) {
  return normaliseFeed(readFeedDocument(document.text), {
    feedUrl: feedUrl.href,
    baseUrl: document.url.href,
    fetchedAt: new Date().toISOString(),
  });
}
