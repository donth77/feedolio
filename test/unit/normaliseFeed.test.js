import { describe, expect, it } from 'vitest';
import { shortId } from '../../src/lib/hash.js';
import { feedIdFor } from '../../src/lib/url.js';
import { normaliseFeed } from '../../worker/lib/normaliseFeed.js';
import { readFeedDocument } from '../../worker/lib/parser.js';
import { EDGE_CASE_FEEDS, FEED_XML, STARTER_FEEDS } from '../fixtures/web.js';

const FETCHED_AT = '2026-11-09T12:00:00.000Z';

/**
 * @param {keyof typeof FEED_XML} name
 * @param {string} feedUrl
 */
function read(name, feedUrl) {
  return normaliseFeed(readFeedDocument(FEED_XML[name]), { feedUrl, fetchedAt: FETCHED_AT });
}

/** @param {string} xml */
function readXml(xml, feedUrl = 'https://site.test/feed') {
  return normaliseFeed(readFeedDocument(xml), { feedUrl, fetchedAt: FETCHED_AT });
}

describe('the five starter feeds', () => {
  it.each([
    ['backchannel', STARTER_FEEDS.backchannel, 'Backchannel - Medium', 10, 0],
    ['economist', STARTER_FEEDS.economist, 'The Economist - Medium', 10, 0],
    ['techcrunchStartups', STARTER_FEEDS.techcrunchStartups, 'Startups | TechCrunch', 20, 33],
    ['bbcTechnology', STARTER_FEEDS.bbcTechnology, 'BBC News', 21, 3],
    ['verge', STARTER_FEEDS.verge, 'The Verge', 10, 447],
  ])('%s gives well-formed stories', (name, url, title, count, postsPerWeek) => {
    const { feed, stories, fetchedAt } = read(/** @type {any} */ (name), url);

    expect(feed).toMatchObject({ id: feedIdFor(url), url, title, postsPerWeek });
    expect(fetchedAt).toBe(FETCHED_AT);
    expect(stories).toHaveLength(count);
    expect(new Set(stories.map((story) => story.id)).size).toBe(count);

    for (const story of stories) {
      expect(story.id).toMatch(/^s_[0-9a-z]+$/);
      expect(story.feedId).toBe(feed.id);
      expect(story.title).not.toBe('');
      expect(story.title).not.toMatch(/[<>]/);
      expect(story.link).toMatch(/^https:\/\//);
      expect(story.excerpt.length).toBeLessThanOrEqual(200);
      expect(story.excerpt).not.toMatch(/<[a-z/]/i);
      expect(story.publishedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/);
    }
  });

  it('gives the same ids every time, whenever it was fetched', () => {
    const first = read('verge', STARTER_FEEDS.verge);
    const later = normaliseFeed(readFeedDocument(FEED_XML.verge), {
      feedUrl: STARTER_FEEDS.verge,
      fetchedAt: '2027-01-01T00:00:00.000Z',
    });
    expect(later.stories.map((story) => story.id)).toEqual(first.stories.map((story) => story.id));
  });
});

describe('Medium (Backchannel, The Economist)', () => {
  it('takes the first figure image and never the tracking pixel (T-01)', () => {
    for (const [name, url] of [
      ['backchannel', STARTER_FEEDS.backchannel],
      ['economist', STARTER_FEEDS.economist],
    ]) {
      const { stories } = read(/** @type {any} */ (name), url);
      for (const story of stories) {
        expect(story.imageUrl).toMatch(/^https:\/\/cdn-images-1\.medium\.com\/max\/\d+\//);
        expect(story.imageSource).toBe('content');
        expect(story.imageUrl).not.toContain('/_/stat');
      }
    }
    expect(read('backchannel', STARTER_FEEDS.backchannel).stories[0].imageUrl).toBe(
      'https://cdn-images-1.medium.com/max/1024/1*kvUxCePPMcrCCdoSXTJYsg.jpeg',
    );
  });

  it('reads the full story and marks the one description-only story as a summary', () => {
    const { stories } = read('backchannel', STARTER_FEEDS.backchannel);
    expect(stories[0]).toMatchObject({
      title: 'News From Backchannel',
      author: 'Steven Levy',
      publishedAt: '2018-01-03T20:00:05.000Z',
      categories: ['internet', 'tech', 'news', 'technology', 'journalism'],
      hasFullContent: true,
    });
    expect(stories[0].excerpt).toMatch(/^We’re now officially and totally integrated into Wired\./);
    expect(stories.map((story) => story.hasFullContent)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
    ]);
    expect(stories[8].imageUrl).toBe(
      'https://cdn-images-1.medium.com/max/1200/1*U_6hBZ1mpID7vXihCjys-g.jpeg',
    );
  });
});

describe('BBC Technology', () => {
  it('uses media:thumbnail and knows the feed only has summaries (T-02)', () => {
    const { stories } = read('bbcTechnology', STARTER_FEEDS.bbcTechnology);
    for (const story of stories) {
      expect(story.imageSource).toBe('media');
      expect(story.imageUrl).toMatch(/^https:\/\/ichef\.bbci\.co\.uk\//);
      expect(story.hasFullContent).toBe(false);
    }
    expect(stories[0]).toMatchObject({
      title: 'AI stocks climb after trillions wiped from market values',
      link: 'https://www.bbc.co.uk/news/articles/c35ynnpzdq51o?at_medium=RSS&at_campaign=rss',
      author: null,
      excerpt:
        'Investors had been selling off tech shares in part due to concerns the Democrat election victory would mean slower AI development.',
    });
  });
});

describe('TechCrunch Startups', () => {
  it('has no images and no full stories (T-03)', () => {
    const { stories } = read('techcrunchStartups', STARTER_FEEDS.techcrunchStartups);
    for (const story of stories) {
      expect(story).toMatchObject({ imageUrl: null, imageSource: null, hasFullContent: false });
    }
    expect(stories[0]).toMatchObject({
      title: 'How a Blue Wave midterm might reshape the AI industry',
      author: "Theresa Loconsolo, Anthony Ha, Sean O'Kane, Kirsten Korosec",
      publishedAt: '2026-11-06T18:00:00.000Z',
    });
  });
});

describe('The Verge (Atom)', () => {
  it('reads Atom entries, authors from <author><name> and images from the content (T-04)', () => {
    const { feed, stories } = read('verge', STARTER_FEEDS.verge);
    expect(feed.siteUrl).toBe('https://www.theverge.com/');
    expect(stories[0]).toMatchObject({
      title: 'All the latest updates on AI data centers',
      link: 'https://www.theverge.com/ai-artificial-intelligence/902546/data-centers-ai-energy-power-grids-controversy',
      author: 'Verge Staff, Justine Calma',
      publishedAt: '2026-11-06T20:02:22.000Z',
      categories: ['AI', 'Energy', 'Environment', 'News', 'Science'],
      hasFullContent: true,
      imageSource: 'content',
      // "&#038;" in the feed's HTML becomes a real "&".
      imageUrl:
        'https://platform.theverge.com/wp-content/uploads/sites/2/2026/04/STKS528_DATA_CENTERS_C.jpg?quality=90&strip=all&crop=0,0,100,100',
    });
    for (const story of stories) expect(story.imageSource).toBe('content');
  });
});

describe('edge cases', () => {
  it('keeps hostile HTML out of every plain-text field', () => {
    const { feed, stories } = read('hostile', EDGE_CASE_FEEDS.hostile);
    const [story] = stories;

    expect(feed.title).toBe('Hostile Feed');
    expect(story.title).toBe('Click me');
    expect(story.excerpt).toBe('Short summary with inside.');
    // A javascript: link is replaced by the site's address.
    expect(story.link).toBe('https://hostile.test/');
    // data: images are skipped.
    expect(story.imageUrl).toBe('https://hostile.test/x.png');
    // The body stays exactly as sent; the story page sanitises it.
    expect(story.contentHtml).toContain('<script>');
  });

  it('accepts a feed with no stories', () => {
    const { feed, stories } = read('empty', EDGE_CASE_FEEDS.empty);
    expect(feed).toMatchObject({
      title: 'Quiet Feed',
      siteUrl: 'https://quiet.test/',
      postsPerWeek: null,
    });
    expect(stories).toEqual([]);
  });

  it('gives undated stories a null date, and no posting rate without two dates', () => {
    const { feed, stories } = read('undated', EDGE_CASE_FEEDS.undated);
    expect(stories.map((story) => story.publishedAt)).toEqual([
      null,
      null,
      '2026-11-05T09:30:00.000Z',
    ]);
    expect(feed.postsPerWeek).toBeNull();
  });

  it('resolves relative Atom links and builds ids from links when entries have none', () => {
    const { feed, stories } = read('relativeLinks', EDGE_CASE_FEEDS.relativeLinks);
    expect(feed).toMatchObject({
      title: 'Relative Notes',
      description: 'Notes without ids',
      siteUrl: 'https://relative.test/',
      postsPerWeek: 6,
    });
    expect(stories[0]).toMatchObject({
      id: shortId('s', 'https://relative.test/notes/engines'),
      title: 'Engines and looms',
      link: 'https://relative.test/notes/engines',
      author: 'Ada Lovelace',
      publishedAt: '2026-11-06T10:00:00.000Z',
      contentHtml:
        '<p>Inline <strong>XHTML</strong> content &amp; an image:</p><img src="/images/loom.jpg" alt="A loom" />',
      imageUrl: 'https://relative.test/images/loom.jpg',
    });
    expect(stories[1]).toMatchObject({
      title: 'Plain & simple',
      link: 'https://relative.test/notes/plain',
      contentHtml:
        '<p>Text with &#60;angle brackets&#62; that must stay text.</p><p>A second paragraph.</p>',
      excerpt: 'Text with <angle brackets> that must stay text. A second paragraph.',
    });
  });

  it('reads RSS 1.0 (RDF) feeds', () => {
    const { feed, stories } = read('rss1', EDGE_CASE_FEEDS.rss1);
    expect(feed).toMatchObject({ title: 'Classic RSS 1.0', postsPerWeek: 4 });
    expect(stories).toHaveLength(2);
    expect(stories[0]).toMatchObject({
      id: shortId('s', 'https://classic.test/2026/11/first'),
      author: 'Grace Hopper',
      publishedAt: '2026-11-04T12:00:00.000Z',
    });
  });
});

describe('story ids', () => {
  const feedWith = (/** @type {string} */ guid) =>
    `<rss version="2.0"><channel><title>T</title><link>https://site.test/</link><item><title>One</title><link>https://site.test/one</link>${guid}</item></channel></rss>`;

  it('treats URL guids as global, so the same story in two feeds is one story', () => {
    const guid = '<guid isPermaLink="false">https://site.test/?p=1</guid>';
    const inA = readXml(feedWith(guid), 'https://site.test/a.xml').stories[0].id;
    const inB = readXml(feedWith(guid), 'https://site.test/b.xml').stories[0].id;
    expect(inA).toBe(inB);
  });

  it('keeps other guids apart per feed', () => {
    const guid = '<guid isPermaLink="false">42</guid>';
    const inA = readXml(feedWith(guid), 'https://site.test/a.xml').stories[0].id;
    const inB = readXml(feedWith(guid), 'https://site.test/b.xml').stories[0].id;
    expect(inA).not.toBe(inB);
  });

  it('drops repeated stories within a feed', () => {
    const item = '<item><title>Twice</title><link>https://site.test/twice</link></item>';
    const xml = `<rss version="2.0"><channel><title>T</title>${item}${item}</channel></rss>`;
    expect(readXml(xml).stories).toHaveLength(1);
  });
});

describe('text fields', () => {
  it('decodes double-escaped titles and HTML entities', () => {
    const xml = `<rss version="2.0"><channel><title>AT&amp;amp;T &#8212; news&nbsp;feed</title>
      <item><title>Apple&amp;#8217;s &lt;b&gt;new&lt;/b&gt; chip &#146;s</title><link>https://site.test/1</link></item>
    </channel></rss>`;
    const { feed, stories } = readXml(xml);
    expect(feed.title).toBe('AT&T — news feed');
    expect(stories[0].title).toBe('Apple’s new chip ’s');
  });

  it('shortens long excerpts on a word boundary', () => {
    const words = 'word '.repeat(100);
    const xml = `<rss version="2.0"><channel><title>T</title><item><title>Long</title><link>https://site.test/1</link><description>${words}</description></item></channel></rss>`;
    const { excerpt } = readXml(xml).stories[0];
    expect(excerpt.length).toBeLessThanOrEqual(200);
    expect(excerpt).toMatch(/word…$/);
  });

  it('names the author from an RSS <author> email, and hides bare addresses', () => {
    const item = (/** @type {string} */ author) =>
      `<rss version="2.0"><channel><title>T</title><item><title>A</title><link>https://site.test/1</link><author>${author}</author></item></channel></rss>`;
    expect(readXml(item('jo@site.test (Jo Bloggs)')).stories[0].author).toBe('Jo Bloggs');
    expect(readXml(item('jo@site.test')).stories[0].author).toBeNull();
    expect(readXml(item('Jo Bloggs')).stories[0].author).toBe('Jo Bloggs');
  });

  it('falls back to the start of the text for stories without a title', () => {
    const xml = `<rss version="2.0"><channel><title>T</title><item><link>https://site.test/1</link><description>Just a short note.</description></item></channel></rss>`;
    expect(readXml(xml).stories[0].title).toBe('Just a short note.');
  });
});

describe('fallbacks for sparse feeds', () => {
  const rss = (/** @type {string} */ channel) =>
    `<rss version="2.0"><channel>${channel}</channel></rss>`;

  it('uses a permalink guid when an item has no <link>, but not a guid marked otherwise', () => {
    const { stories } = readXml(
      rss(`<title>T</title><link>https://site.test/</link>
        <item><title>A</title><guid>https://site.test/posts/a</guid></item>
        <item><title>B</title><guid isPermaLink="false">https://site.test/?p=2</guid></item>`),
    );
    expect(stories.map((story) => story.link)).toEqual([
      'https://site.test/posts/a',
      'https://site.test/',
    ]);
  });

  it('reads Atom-style <link href> inside RSS items', () => {
    const { stories } = readXml(
      rss('<title>T</title><item><title>A</title><link href="https://site.test/a"/></item>'),
    );
    expect(stories[0].link).toBe('https://site.test/a');
  });

  it('names an untitled feed after its site, and an untitled story “Untitled story”', () => {
    const { feed, stories } = readXml(
      rss('<link>https://www.site.test/</link><item><guid>x</guid></item>'),
    );
    expect(feed.title).toBe('site.test');
    expect(stories[0].title).toBe('Untitled story');
    expect(stories[0].link).toBe('https://www.site.test/');
  });

  it('links to the feed itself when nothing better exists', () => {
    const { feed, stories } = readXml(
      rss('<item><title>A</title></item>'),
      'https://site.test/feed.xml',
    );
    expect(feed.title).toBe('site.test');
    expect(stories[0].link).toBe('https://site.test/feed.xml');
  });

  it('has no posting rate when every story shares one timestamp', () => {
    const item = (/** @type {string} */ link) =>
      `<item><title>A</title><link>${link}</link><pubDate>Thu, 05 Nov 2026 09:30:00 +0000</pubDate></item>`;
    expect(
      readXml(rss(`<title>T</title>${item('https://site.test/1')}${item('https://site.test/2')}`))
        .feed.postsPerWeek,
    ).toBeNull();
  });

  it('reads the first channel of a feed with several, and the iTunes artwork as the feed image', () => {
    const xml = `<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
      <channel><title>First</title><itunes:image href="https://site.test/art.jpg"/></channel>
      <channel><title>Second</title></channel></rss>`;
    expect(readXml(xml).feed).toMatchObject({
      title: 'First',
      imageUrl: 'https://site.test/art.jpg',
    });
  });
});

describe('Atom variations', () => {
  const atom = (/** @type {string} */ entry) =>
    `<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title><link href="https://site.test/"/><entry>${entry}</entry></feed>`;

  it('uses the summary when the content lives elsewhere', () => {
    const [story] = readXml(
      atom(
        '<title>T</title><id>https://site.test/e</id><content src="https://site.test/e.html"/><summary>Short.</summary>',
      ),
    ).stories;
    expect(story.contentHtml).toBe('<p>Short.</p>');
    expect(story.link).toBe('https://site.test/e');
  });

  it('keeps HTML that a feed labels as plain text', () => {
    const [story] = readXml(
      atom(
        '<title>T</title><content type="text">&lt;p&gt;Real &lt;em&gt;HTML&lt;/em&gt;&lt;/p&gt;</content>',
      ),
    ).stories;
    expect(story.contentHtml).toBe('<p>Real <em>HTML</em></p>');
  });

  it('skips content in other media types', () => {
    const [story] = readXml(
      atom(
        '<title>T</title><content type="application/pdf">JVBERi0=</content><summary>Fallback</summary>',
      ),
    ).stories;
    expect(story.contentHtml).toBe('<p>Fallback</p>');
  });

  it('prefers a category’s label to its term', () => {
    const [story] = readXml(
      atom('<title>T</title><category term="tech" label="Technology"/><category term="ai"/>'),
    ).stories;
    expect(story.categories).toEqual(['Technology', 'ai']);
  });

  it('prefers the HTML alternate link, and takes any alternate otherwise', () => {
    const links =
      '<link rel="alternate" type="application/pdf" href="/e.pdf"/><link rel="alternate" type="text/html" href="/e"/>';
    expect(readXml(atom(`<title>T</title>${links}`)).stories[0].link).toBe('https://site.test/e');
    expect(
      readXml(atom('<title>T</title><link rel="alternate" type="application/pdf" href="/e.pdf"/>'))
        .stories[0].link,
    ).toBe('https://site.test/e.pdf');
  });
});

describe('documents that are not feeds', () => {
  it.each([
    ['an HTML page', '<html><head><title>Hi</title></head><body></body></html>'],
    ['an SVG image', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ['plain text', 'just some text'],
  ])('rejects %s with NOT_A_FEED', (_, text) => {
    expect(() => readFeedDocument(text)).toThrow(expect.objectContaining({ code: 'NOT_A_FEED' }));
  });
});
