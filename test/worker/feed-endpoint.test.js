import { exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../worker/index.js';
import { STARTER_FEEDS } from '../fixtures/web.js';
import { fakeInternet, never, streamOf } from './fakeInternet.js';

/**
 * Asks the Worker for a feed, the way the app does.
 *
 * @param {string} url
 * @param {RequestInit} [init]
 */
function getFeed(url, init) {
  return exports.default.fetch(
    `https://feedolio.test/api/feed?url=${encodeURIComponent(url)}`,
    init,
  );
}

/** @param {Response} response */
async function errorOf(response) {
  expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBeNull();
  const body = await response.json();
  return { status: response.status, ...body.error };
}

const RSS = { 'Content-Type': 'application/rss+xml; charset=utf-8' };
const TINY_FEED =
  '<?xml version="1.0"?><rss version="2.0"><channel><title>Tiny</title><link>https://tiny.test/</link>' +
  '<item><title>Hello</title><link>https://tiny.test/hello</link></item></channel></rss>';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a feed address', () => {
  it.each([
    ['Backchannel', STARTER_FEEDS.backchannel, 10],
    ['The Economist', STARTER_FEEDS.economist, 10],
    ['TechCrunch Startups', STARTER_FEEDS.techcrunchStartups, 20],
    ['BBC Technology', STARTER_FEEDS.bbcTechnology, 21],
    ['The Verge', STARTER_FEEDS.verge, 10],
  ])('returns %s as normalised JSON', async (_, url, count) => {
    const requests = fakeInternet();
    const response = await getFeed(url);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    const body = await response.json();
    expect(body.feed.url).toBe(url);
    expect(body.stories).toHaveLength(count);
    expect(Date.parse(body.fetchedAt)).not.toBeNaN();

    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get('User-Agent')).toBe('FeedolioReader/1.0');
    expect(requests[0].headers.get('Accept')).toMatch(
      /^application\/rss\+xml, application\/atom\+xml/,
    );
  });

  it('is cached at the edge with stale fallbacks, never with s-maxage (T-20)', async () => {
    fakeInternet();
    const response = await getFeed(STARTER_FEEDS.verge);

    expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe(
      'max-age=600, stale-while-revalidate=3600, stale-if-error=86400',
    );
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    for (const [, value] of response.headers) expect(value).not.toMatch(/s-maxage/i);
  });

  it('reads a feed served as text/html', async () => {
    fakeInternet({
      'https://tiny.test/feed': () =>
        new Response(TINY_FEED, { headers: { 'Content-Type': 'text/html' } }),
    });
    const response = await getFeed('https://tiny.test/feed');
    expect(response.status).toBe(200);
    expect((await response.json()).stories[0].title).toBe('Hello');
  });

  it('decodes the charset named in the XML declaration', async () => {
    const latin1 = Uint8Array.from(
      '<?xml version="1.0" encoding="ISO-8859-1"?><rss version="2.0"><channel><title>Caf\xe9 news</title></channel></rss>',
      (char) => char.charCodeAt(0),
    );
    fakeInternet({
      'https://cafe.test/feed': () =>
        new Response(latin1, { headers: { 'Content-Type': 'application/rss+xml' } }),
    });
    expect((await (await getFeed('https://cafe.test/feed')).json()).feed.title).toBe('Café news');
  });

  it('recognises a feed that comes without a Content-Type', async () => {
    fakeInternet({
      'https://bare.test/feed': () => new Response(new TextEncoder().encode(TINY_FEED)),
    });
    expect((await getFeed('https://bare.test/feed')).status).toBe(200);
  });

  it('follows up to three redirects, checking each one', async () => {
    const requests = fakeInternet({
      'http://tiny.test/feed': () => Response.redirect('https://tiny.test/feed', 301),
      'https://tiny.test/feed': () =>
        new Response(null, { status: 302, headers: { Location: '/feed/' } }),
      'https://tiny.test/feed/': () =>
        new Response(null, {
          status: 307,
          headers: { Location: 'https://cdn.tiny.test/feed.xml' },
        }),
      'https://cdn.tiny.test/feed.xml': () => new Response(TINY_FEED, { headers: RSS }),
    });
    const response = await getFeed('http://tiny.test/feed');

    expect(response.status).toBe(200);
    // The feed keeps the address it was asked for.
    expect((await response.json()).feed.url).toBe('http://tiny.test/feed');
    expect(requests.map((request) => request.url)).toEqual([
      'http://tiny.test/feed',
      'https://tiny.test/feed',
      'https://tiny.test/feed/',
      'https://cdn.tiny.test/feed.xml',
    ]);
  });
});

describe('a website address (feed discovery)', () => {
  it('finds The Verge’s Atom feed from theverge.com (T-21)', async () => {
    const requests = fakeInternet();
    const response = await getFeed('https://theverge.com');

    expect(response.status).toBe(200);
    const { feed, stories } = await response.json();
    expect(feed).toMatchObject({
      url: 'https://www.theverge.com/rss/index.xml',
      title: 'The Verge',
    });
    expect(feed.postsPerWeek).toBeGreaterThan(0);
    expect(stories).toHaveLength(10);
    expect(requests.map((request) => request.url)).toEqual([
      'https://theverge.com/',
      'https://www.theverge.com/',
      'https://www.theverge.com/rss/index.xml',
    ]);
  });

  it('offers a choice when a page links to several feeds (T-22)', async () => {
    fakeInternet();
    const response = await getFeed('https://github.blog/');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toMatch(/^max-age=600/);
    expect(await response.json()).toEqual({
      choices: [
        { title: 'The GitHub Blog » Feed', url: 'https://github.blog/feed/' },
        { title: 'The GitHub Blog » Comments Feed', url: 'https://github.blog/comments/feed/' },
      ],
    });
  });

  it('says so when a page has no feed (T-23)', async () => {
    fakeInternet();
    const error = await errorOf(await getFeed('https://example.com/'));
    expect(error).toMatchObject({ status: 422, code: 'NO_FEED_FOUND' });
    expect(error.message).toMatch(/couldn’t find a feed/);
  });

  it('reads only the first megabyte of a large page, and still finds its feed', async () => {
    const page =
      '<!doctype html><html><head><link rel="alternate" type="application/rss+xml" href="/feed"></head><body>';
    fakeInternet({
      'https://big.test/': () =>
        new Response(streamOf(page, 3 * 1024 * 1024), { headers: { 'Content-Type': 'text/html' } }),
      'https://big.test/feed': () => new Response(TINY_FEED, { headers: RSS }),
    });
    expect((await getFeed('https://big.test/')).status).toBe(200);
  });

  it('only discovers once: a feed link that leads to another page is NOT_A_FEED', async () => {
    fakeInternet({
      'https://loop.test/': () =>
        new Response(
          '<html><head><link rel="alternate" type="application/rss+xml" href="/feed"></head></html>',
          {
            headers: { 'Content-Type': 'text/html' },
          },
        ),
      'https://loop.test/feed': () =>
        new Response('<!doctype html><html><head></head></html>', { headers: RSS }),
    });
    expect(await errorOf(await getFeed('https://loop.test/'))).toMatchObject({
      status: 422,
      code: 'NOT_A_FEED',
    });
  });

  it('checks discovered links like any other address', async () => {
    const requests = fakeInternet({
      'https://sneaky.test/': () =>
        new Response(
          '<html><head><link rel="alternate" type="application/rss+xml" href="http://localhost/feed"></head></html>',
          {
            headers: { 'Content-Type': 'text/html' },
          },
        ),
    });
    expect(await errorOf(await getFeed('https://sneaky.test/'))).toMatchObject({
      status: 400,
      code: 'BLOCKED_HOST',
    });
    expect(requests).toHaveLength(1);
  });
});

describe('errors', () => {
  it.each([
    ['no address', null],
    ['an address without a scheme', 'theverge.com'],
    ['an ftp address', 'ftp://example.com/feed'],
  ])('INVALID_URL for %s', async (_, url) => {
    const requests = fakeInternet();
    const response = await exports.default.fetch(
      url === null
        ? 'https://feedolio.test/api/feed'
        : `https://feedolio.test/api/feed?url=${encodeURIComponent(url)}`,
    );
    expect(await errorOf(response)).toMatchObject({ status: 400, code: 'INVALID_URL' });
    expect(requests).toHaveLength(0);
  });

  it('BLOCKED_HOST for the cloud metadata address, without connecting (T-05)', async () => {
    const requests = fakeInternet();
    expect(await errorOf(await getFeed('http://169.254.169.254/latest'))).toMatchObject({
      status: 400,
      code: 'BLOCKED_HOST',
    });
    expect(requests).toHaveLength(0);
  });

  it.each(['http://localhost/admin', 'http://[::ffff:127.0.0.1]/'])(
    'BLOCKED_HOST when a site redirects to %s (T-06)',
    async (target) => {
      const requests = fakeInternet({
        'https://redirector.test/feed': () =>
          new Response(null, { status: 302, headers: { Location: target } }),
      });
      expect(await errorOf(await getFeed('https://redirector.test/feed'))).toMatchObject({
        status: 400,
        code: 'BLOCKED_HOST',
      });
      expect(requests).toHaveLength(1);
    },
  );

  it('UPSTREAM_ERROR with the status for the brief’s old TechCrunch address (T-07)', async () => {
    fakeInternet();
    expect(await errorOf(await getFeed('https://techcrunch.com/startups/feed/'))).toMatchObject({
      status: 502,
      code: 'UPSTREAM_ERROR',
      upstreamStatus: 404,
    });
  });

  it('UPSTREAM_ERROR when the publisher fails or can’t be reached', async () => {
    fakeInternet({ 'https://broken.test/feed': () => new Response('oops', { status: 500 }) });
    expect(await errorOf(await getFeed('https://broken.test/feed'))).toMatchObject({
      status: 502,
      code: 'UPSTREAM_ERROR',
      upstreamStatus: 500,
    });

    vi.restoreAllMocks();
    fakeInternet();
    const unreachable = await errorOf(await getFeed('https://unreachable.test/feed'));
    expect(unreachable).toMatchObject({ status: 502, code: 'UPSTREAM_ERROR' });
    expect(unreachable.upstreamStatus).toBeUndefined();
  });

  it('UPSTREAM_ERROR when the connection drops part-way through', async () => {
    fakeInternet({
      'https://flaky.test/feed': () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(TINY_FEED.slice(0, 40)));
              controller.error(new Error('connection reset'));
            },
          }),
          { headers: RSS },
        ),
    });
    const error = await errorOf(await getFeed('https://flaky.test/feed'));
    expect(error).toMatchObject({ status: 502, code: 'UPSTREAM_ERROR' });
    expect(error.message).toMatch(/dropped/);
  });

  it('UPSTREAM_ERROR after a fourth redirect, or a redirect to nowhere', async () => {
    fakeInternet({
      'https://hops.test/0': () => Response.redirect('https://hops.test/1', 301),
      'https://hops.test/1': () => Response.redirect('https://hops.test/2', 301),
      'https://hops.test/2': () => Response.redirect('https://hops.test/3', 301),
      'https://hops.test/3': () => Response.redirect('https://hops.test/4', 301),
      'https://hops.test/4': () => new Response(TINY_FEED, { headers: RSS }),
      'https://nowhere.test/feed': () => new Response(null, { status: 301 }),
    });
    expect(await errorOf(await getFeed('https://hops.test/0'))).toMatchObject({
      status: 502,
      code: 'UPSTREAM_ERROR',
    });
    expect(await errorOf(await getFeed('https://nowhere.test/feed'))).toMatchObject({
      status: 502,
      code: 'UPSTREAM_ERROR',
      upstreamStatus: 301,
    });
  });

  it('UPSTREAM_TIMEOUT when the publisher hasn’t answered after 8 seconds', async () => {
    vi.useFakeTimers();
    let asked;
    const askedPromise = new Promise((resolve) => (asked = resolve));
    fakeInternet({ 'https://slow.test/feed': never(() => asked()) });

    // Called directly rather than through exports.default: the fake timer
    // fires in this test's context, and Workers won't share a response body
    // between two request contexts.
    let settled = false;
    const url = `https://feedolio.test/api/feed?url=${encodeURIComponent('https://slow.test/feed')}`;
    const pending = worker.fetch(new Request(url)).then((response) => {
      settled = true;
      return response;
    });
    await askedPromise;
    await vi.advanceTimersByTimeAsync(7_999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await errorOf(await pending)).toMatchObject({ status: 504, code: 'UPSTREAM_TIMEOUT' });
  });

  it.each([
    ['JSON', 'application/json', '{"title":"not a feed"}'],
    ['an image', 'image/png', '\x89PNG\r\n\x1a\n'],
    [
      'other XML',
      'application/xml',
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>',
    ],
    ['an empty body', 'application/rss+xml', ''],
  ])('NOT_A_FEED for %s (T-08)', async (_, type, body) => {
    fakeInternet({
      'https://odd.test/feed': () => new Response(body, { headers: { 'Content-Type': type } }),
    });
    expect(await errorOf(await getFeed('https://odd.test/feed'))).toMatchObject({
      status: 422,
      code: 'NOT_A_FEED',
    });
  });

  it('NOT_A_FEED for a successful answer with no body at all', async () => {
    fakeInternet({ 'https://nothing.test/feed': () => new Response(null, { status: 204 }) });
    expect(await errorOf(await getFeed('https://nothing.test/feed'))).toMatchObject({
      status: 422,
      code: 'NOT_A_FEED',
    });
  });

  it('treats a text/html answer as a page, whatever it holds', async () => {
    fakeInternet({
      'https://plain.test/': () =>
        new Response('Just words, no markup.', { headers: { 'Content-Type': 'text/html' } }),
    });
    expect(await errorOf(await getFeed('https://plain.test/'))).toMatchObject({
      status: 422,
      code: 'NO_FEED_FOUND',
    });
  });

  it('TOO_LARGE for a feed over 5 MB, read or declared', async () => {
    const start = '<?xml version="1.0"?><rss version="2.0"><channel><title>Huge</title>';
    fakeInternet({
      'https://huge.test/streamed': () =>
        new Response(streamOf(start, 5 * 1024 * 1024 + 1), { headers: RSS }),
      'https://huge.test/declared': () =>
        new Response(streamOf(start, 64 * 1024), {
          headers: { ...RSS, 'Content-Length': String(6 * 1024 * 1024) },
        }),
    });
    expect(await errorOf(await getFeed('https://huge.test/streamed'))).toMatchObject({
      status: 502,
      code: 'TOO_LARGE',
    });
    expect(await errorOf(await getFeed('https://huge.test/declared'))).toMatchObject({
      status: 502,
      code: 'TOO_LARGE',
    });
  });

  it('accepts a feed of exactly 5 MB', async () => {
    const start = '<?xml version="1.0"?><rss version="2.0"><channel><title>Big</title><!-- ';
    fakeInternet({
      'https://big.test/feed': () => {
        const end = ' --></channel></rss>';
        const size = 5 * 1024 * 1024;
        const bytes = new Uint8Array(size).fill(32);
        bytes.set(new TextEncoder().encode(start));
        bytes.set(new TextEncoder().encode(end), size - end.length);
        return new Response(bytes, { headers: RSS });
      },
    });
    expect((await getFeed('https://big.test/feed')).status).toBe(200);
  });
});

describe('other requests', () => {
  it('only accepts GET', async () => {
    const response = await getFeed(STARTER_FEEDS.verge, { method: 'POST' });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
    expect((await response.json()).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('answers other requests that reach the Worker with a plain 404', async () => {
    const response = await exports.default.fetch('https://feedolio.test/missing.js');
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
  });

  it('answers unknown API addresses with a JSON 404', async () => {
    const response = await exports.default.fetch('https://feedolio.test/api/nope');
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await response.json()).error.code).toBe('NOT_FOUND');
  });
});
