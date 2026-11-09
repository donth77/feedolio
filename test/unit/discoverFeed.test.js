import { describe, expect, it } from 'vitest';
import { findFeedLinks } from '../../worker/lib/discoverFeed.js';
import { PAGE_HTML } from '../fixtures/web.js';

/**
 * @param {string} head
 * @param {string} [pageUrl]
 */
function linksIn(head, pageUrl = 'https://site.test/blog/') {
  return findFeedLinks(
    `<!doctype html><html><head>${head}</head><body></body></html>`,
    new URL(pageUrl),
  );
}

describe('findFeedLinks on saved pages', () => {
  it('finds The Verge’s one feed from its relative link', () => {
    expect(findFeedLinks(PAGE_HTML.vergeHome, new URL('https://www.theverge.com/'))).toEqual([
      { title: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
    ]);
  });

  it('finds both GitHub Blog feeds and ignores its oEmbed and JSON alternates', () => {
    expect(findFeedLinks(PAGE_HTML.githubBlogHome, new URL('https://github.blog/'))).toEqual([
      { title: 'The GitHub Blog » Feed', url: 'https://github.blog/feed/' },
      { title: 'The GitHub Blog » Comments Feed', url: 'https://github.blog/comments/feed/' },
    ]);
  });

  it('finds nothing on a page without feed links', () => {
    expect(findFeedLinks(PAGE_HTML.exampleCom, new URL('https://example.com/'))).toEqual([]);
  });
});

describe('findFeedLinks rules', () => {
  it('resolves relative links against <base href> when there is one', () => {
    expect(
      linksIn(
        '<base href="https://cdn.site.test/b/"><link rel="alternate" type="application/atom+xml" href="feed.atom">',
      ),
    ).toEqual([
      { title: 'https://cdn.site.test/b/feed.atom', url: 'https://cdn.site.test/b/feed.atom' },
    ]);
  });

  it('reads attribute values in any case, quoting and order', () => {
    expect(
      linksIn(
        `<LINK HREF='/rss' TYPE="Application/RSS+XML; charset=utf-8" REL="alternate feed" TITLE="Posts &amp; news">`,
      ),
    ).toEqual([{ title: 'Posts & news', url: 'https://site.test/rss' }]);
  });

  it('ignores alternates that are not RSS or Atom (languages, oEmbed, JSON)', () => {
    expect(
      linksIn(`
        <link rel="alternate" hreflang="en-gb" href="https://site.test/uk/">
        <link rel="alternate" type="application/json+oembed" href="/oembed">
        <link rel="alternate" type="application/feed+json" href="/feed.json">
        <link rel="stylesheet" type="application/rss+xml" href="/not-a-feed">
      `),
    ).toEqual([]);
  });

  it('drops duplicates, unsafe links, links in comments and links after the head', () => {
    const html = `<!doctype html><html><head>
      <link rel="alternate" type="application/rss+xml" href="/feed">
      <link rel="alternate" type="application/rss+xml" href="https://site.test/feed">
      <link rel="alternate" type="application/rss+xml" href="javascript:alert(1)">
      <!-- <link rel="alternate" type="application/rss+xml" href="/old-feed"> -->
    </head><body><link rel="alternate" type="application/rss+xml" href="/body-feed"></body></html>`;
    expect(findFeedLinks(html, new URL('https://site.test/'))).toEqual([
      { title: 'https://site.test/feed', url: 'https://site.test/feed' },
    ]);
  });

  it('reads the whole page when it has no </head>, and ignores links without rel="alternate"', () => {
    const html = `<html><title>No head end</title>
      <link type="application/rss+xml" href="/no-rel">
      <link rel="alternate" type="application/atom+xml" href="/atom" title="  Atom   posts ">`;
    expect(findFeedLinks(html, new URL('https://site.test/'))).toEqual([
      { title: 'Atom posts', url: 'https://site.test/atom' },
    ]);
  });

  it('keeps at most ten feeds', () => {
    const many = Array.from(
      { length: 12 },
      (_, n) => `<link rel="alternate" type="application/rss+xml" href="/feed-${n}">`,
    ).join('');
    expect(linksIn(many)).toHaveLength(10);
  });
});
