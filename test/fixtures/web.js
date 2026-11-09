/**
 * The internet, as far as tests are concerned: saved answers from real
 * publishers, plus hand-written edge cases on reserved `.test` domains.
 * Journey tests serve these through MSW; Worker contract tests serve them by
 * standing in for fetch. See README.md here for where each file came from.
 */
import backchannel from './feeds/backchannel.xml?raw';
import bbcTechnology from './feeds/bbc-technology.xml?raw';
import economist from './feeds/economist.xml?raw';
import empty from './feeds/empty.xml?raw';
import hostile from './feeds/hostile.xml?raw';
import relativeLinks from './feeds/relative-links.atom?raw';
import rss1 from './feeds/rss1.rdf?raw';
import techcrunchStartups from './feeds/techcrunch-startups.xml?raw';
import undated from './feeds/undated.xml?raw';
import verge from './feeds/verge.atom?raw';
import exampleCom from './pages/example-com.html?raw';
import githubBlogHome from './pages/github-blog-home.html?raw';
import techcrunchOldStartups404 from './pages/techcrunch-old-startups-404.html?raw';
import vergeHome from './pages/verge-home.html?raw';

/** The five starter feeds, at their real addresses. */
export const STARTER_FEEDS = {
  backchannel: 'https://medium.com/feed/backchannel',
  economist: 'https://medium.com/feed/the-economist',
  techcrunchStartups: 'https://techcrunch.com/category/startups/feed/',
  bbcTechnology: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
  verge: 'https://www.theverge.com/rss/index.xml',
};

/** Hand-written edge-case feeds. */
export const EDGE_CASE_FEEDS = {
  hostile: 'https://hostile.test/feed.xml',
  empty: 'https://quiet.test/feed.xml',
  undated: 'https://undated.test/feed.xml',
  relativeLinks: 'https://relative.test/feed.atom',
  rss1: 'https://classic.test/index.rdf',
};

/** Raw feed text by name, for tests that read a feed without fetching it. */
export const FEED_XML = {
  backchannel,
  economist,
  techcrunchStartups,
  bbcTechnology,
  verge,
  hostile,
  empty,
  undated,
  relativeLinks,
  rss1,
};

/** Raw page HTML by name. */
export const PAGE_HTML = { vergeHome, githubBlogHome, exampleCom };

const RSS = 'application/rss+xml; charset=UTF-8';
const XML = 'text/xml; charset=UTF-8';
const HTML = 'text/html; charset=utf-8';

/**
 * Every saved answer, by exact URL, as the publisher served it.
 *
 * @type {Record<string, { status: number, headers: Record<string, string>, body?: string }>}
 */
export const WEB = {
  [STARTER_FEEDS.backchannel]: { status: 200, headers: { 'Content-Type': XML }, body: backchannel },
  [STARTER_FEEDS.economist]: { status: 200, headers: { 'Content-Type': XML }, body: economist },
  [STARTER_FEEDS.techcrunchStartups]: {
    status: 200,
    headers: { 'Content-Type': RSS },
    body: techcrunchStartups,
  },
  [STARTER_FEEDS.bbcTechnology]: {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body: bbcTechnology,
  },
  [STARTER_FEEDS.verge]: {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=UTF-8' },
    body: verge,
  },

  // The brief's TechCrunch address: an HTML "Page not found" that claims to be RSS.
  'https://techcrunch.com/startups/feed/': {
    status: 404,
    headers: { 'Content-Type': RSS },
    body: techcrunchOldStartups404,
  },

  // Web pages, for feed discovery.
  'https://theverge.com/': { status: 301, headers: { Location: 'https://www.theverge.com/' } },
  'https://www.theverge.com/': { status: 200, headers: { 'Content-Type': HTML }, body: vergeHome },
  'https://github.blog/': {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
    body: githubBlogHome,
  },
  'https://example.com/': { status: 200, headers: { 'Content-Type': HTML }, body: exampleCom },

  [EDGE_CASE_FEEDS.hostile]: { status: 200, headers: { 'Content-Type': RSS }, body: hostile },
  [EDGE_CASE_FEEDS.empty]: { status: 200, headers: { 'Content-Type': RSS }, body: empty },
  [EDGE_CASE_FEEDS.undated]: { status: 200, headers: { 'Content-Type': RSS }, body: undated },
  [EDGE_CASE_FEEDS.relativeLinks]: {
    status: 200,
    headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
    body: relativeLinks,
  },
  [EDGE_CASE_FEEDS.rss1]: {
    status: 200,
    headers: { 'Content-Type': 'application/rdf+xml; charset=utf-8' },
    body: rss1,
  },
};

/**
 * A fresh Response for a saved address, or undefined. Each call builds a new
 * Response, because a body can only be read once.
 *
 * @param {string} url
 */
export function savedAnswer(url) {
  const saved = WEB[url];
  return saved && new Response(saved.body ?? null, { status: saved.status, headers: saved.headers });
}
