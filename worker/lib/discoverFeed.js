import { parseAttributes, safeHttpUrl } from './text.js';

const FEED_TYPES = new Set(['application/rss+xml', 'application/atom+xml']);
const MAX_LINKS = 10;
const LINK_TAG = /<link\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const BASE_TAG = /<base\b((?:[^>"']|"[^"]*"|'[^']*')*)>/i;

/**
 * Finds the feeds a web page advertises with
 * `<link rel="alternate" type="application/rss+xml|application/atom+xml">`.
 * Relative addresses are resolved (honouring <base href>), duplicates are
 * dropped, and at most ten are kept, in page order.
 *
 * @param {string} html  The page, or its first megabyte
 * @param {URL} pageUrl  Where the page was finally fetched from
 * @returns {{ title: string, url: string }[]}
 */
export function findFeedLinks(html, pageUrl) {
  const headEnd = html.search(/<\/head\s*>/i);
  const head = (headEnd === -1 ? html : html.slice(0, headEnd)).replace(/<!--[\s\S]*?-->/g, '');
  const baseHref = parseAttributes(BASE_TAG.exec(head)?.[1] ?? '').href;
  const base = safeHttpUrl(baseHref, pageUrl) ?? pageUrl.href;

  /** @type {{ title: string, url: string }[]} */
  const feeds = [];
  for (const [, source] of head.matchAll(LINK_TAG)) {
    const attributes = parseAttributes(source);
    const rel = (attributes.rel ?? '').toLowerCase().split(/\s+/);
    const type = (attributes.type ?? '').toLowerCase().split(';')[0].trim();
    if (!rel.includes('alternate') || !FEED_TYPES.has(type)) continue;

    const url = safeHttpUrl(attributes.href, base);
    if (!url || feeds.some((feed) => feed.url === url)) continue;
    feeds.push({ title: (attributes.title ?? '').replace(/\s+/g, ' ').trim() || url, url });
    if (feeds.length === MAX_LINKS) break;
  }
  return feeds;
}
