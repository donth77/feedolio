import { feedIdFor } from '../../lib/url.js';

/**
 * Every new reader starts with these five feeds: the brief's three
 * (TechCrunch at its current address) plus BBC Technology and The Verge.
 * Titles are Feedolio's own; BBC's feed calls itself just "BBC News".
 */
export const STARTER_FEEDS = [
  { url: 'https://medium.com/feed/backchannel', title: 'Backchannel' },
  { url: 'https://medium.com/feed/the-economist', title: 'The Economist' },
  { url: 'https://techcrunch.com/category/startups/feed/', title: 'TechCrunch Startups' },
  { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', title: 'BBC Technology' },
  { url: 'https://www.theverge.com/rss/index.xml', title: 'The Verge' },
];

/**
 * The starter feeds as subscriptions, in the order above.
 *
 * @param {number} [now]
 * @returns {import('./subscriptionsSlice.js').Subscription[]}
 */
export function starterSubscriptions(now = Date.now()) {
  return STARTER_FEEDS.map(({ url, title }, index) => ({
    id: feedIdFor(url),
    url,
    title,
    enabled: true,
    isDefault: true,
    addedAt: new Date(now + index).toISOString(),
  }));
}
