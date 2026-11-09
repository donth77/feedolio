import { describe, expect, it } from 'vitest';
import { normaliseFeed } from '../../worker/lib/normaliseFeed.js';
import { readFeedDocument } from '../../worker/lib/parser.js';

/**
 * The main image picked for one RSS item, read through the real parser.
 *
 * @param {string} itemXml  Elements inside <item>
 */
function imageOf(itemXml) {
  const xml = `<?xml version="1.0"?>
    <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
      <channel><title>T</title><link>https://site.test/</link>
        <item><title>Story</title><link>https://site.test/posts/1</link>${itemXml}</item>
      </channel>
    </rss>`;
  const [story] = normaliseFeed(readFeedDocument(xml), {
    feedUrl: 'https://site.test/feed',
    fetchedAt: '2026-11-09T12:00:00.000Z',
  }).stories;
  return { imageUrl: story.imageUrl, imageSource: story.imageSource };
}

/** @param {string} html */
const content = (html) => `<content:encoded><![CDATA[${html}]]></content:encoded>`;

describe('rule 1: media tags', () => {
  it('takes the widest image from media:content and media:thumbnail', () => {
    expect(
      imageOf(`
        <media:thumbnail url="https://img.test/small.jpg" width="240" />
        <media:content url="https://img.test/large.jpg" medium="image" width="1200" />
        <media:content url="https://img.test/medium.jpg" type="image/jpeg" width="800" />`),
    ).toEqual({ imageUrl: 'https://img.test/large.jpg', imageSource: 'media' });
  });

  it('ignores video media but uses its thumbnail, including inside media:group', () => {
    expect(
      imageOf(`
        <media:group>
          <media:content url="https://img.test/clip.mp4" type="video/mp4" width="1920" />
          <media:thumbnail url="https://img.test/poster.jpg" width="480" />
        </media:group>`),
    ).toEqual({ imageUrl: 'https://img.test/poster.jpg', imageSource: 'media' });
  });

  it('accepts untyped media:content when the address is an image', () => {
    expect(imageOf('<media:content url="https://img.test/photo.webp" />').imageUrl).toBe(
      'https://img.test/photo.webp',
    );
  });

  it('wins over an enclosure and over images in the body', () => {
    expect(
      imageOf(`
        <media:thumbnail url="https://img.test/media.jpg" />
        <enclosure url="https://img.test/enclosure.jpg" type="image/jpeg" length="1" />
        ${content('<figure><img src="https://img.test/body.jpg"></figure>')}`).imageSource,
    ).toBe('media');
  });
});

describe('rule 2: image enclosures', () => {
  it('uses an image enclosure', () => {
    expect(
      imageOf('<enclosure url="https://img.test/cover.png" type="image/png" length="1" />'),
    ).toEqual({
      imageUrl: 'https://img.test/cover.png',
      imageSource: 'enclosure',
    });
  });

  it('uses an Atom image enclosure link', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title><entry><title>E</title>
      <link rel="alternate" href="https://site.test/e"/>
      <link rel="enclosure" type="audio/mpeg" href="https://img.test/e.mp3"/>
      <link rel="enclosure" type="image/jpeg" href="https://img.test/e.jpg"/>
    </entry></feed>`;
    const [story] = normaliseFeed(readFeedDocument(xml), {
      feedUrl: 'https://site.test/feed',
      fetchedAt: '2026-11-09T12:00:00.000Z',
    }).stories;
    expect(story).toMatchObject({ imageUrl: 'https://img.test/e.jpg', imageSource: 'enclosure' });
  });

  it('ignores audio enclosures', () => {
    expect(
      imageOf('<enclosure url="https://img.test/episode.mp3" type="audio/mpeg" length="1" />'),
    ).toEqual({
      imageUrl: null,
      imageSource: null,
    });
  });
});

describe('rule 3: the first real image in the body', () => {
  it('prefers a <figure> image to an earlier inline one', () => {
    expect(
      imageOf(
        content(
          '<p><img src="https://img.test/inline.jpg"></p><figure><img src="https://img.test/hero.jpg"></figure>',
        ),
      ),
    ).toEqual({ imageUrl: 'https://img.test/hero.jpg', imageSource: 'content' });
  });

  it('ignores media tags without an address', () => {
    expect(
      imageOf('<media:thumbnail width="900" /><media:thumbnail url="https://img.test/t.jpg" />'),
    ).toEqual({
      imageUrl: 'https://img.test/t.jpg',
      imageSource: 'media',
    });
  });

  it.each([
    ['a 1×1 pixel', '<img src="https://img.test/a.gif" width="1" height="1">'],
    ['a one-pixel-high strip', '<img src="https://img.test/strip.gif" height="1">'],
    ['an icon', '<img src="https://img.test/icon.png" width="64">'],
    ['Medium’s tracking pixel', '<img src="https://medium.com/_/stat?event=post.clientViewed">'],
    ['WordPress stats', '<img src="https://pixel.wp.com/b.gif?v=1">'],
    ['Feedburner', '<img src="https://feeds.feedburner.com/~r/site/~4/abc">'],
    ['a pixel by name', '<img src="https://img.test/tracking/pixel.gif?id=1">'],
    ['a data: URI', '<img src="data:image/png;base64,iVBORw0KGgo=">'],
    ['a javascript: URI', '<img src="javascript:alert(1)">'],
  ])('skips %s', (_, html) => {
    expect(imageOf(content(`${html}<img src="https://img.test/real.jpg">`)).imageUrl).toBe(
      'https://img.test/real.jpg',
    );
  });

  it('keeps pictures whose names only mention a pixel', () => {
    expect(
      imageOf(content('<img src="https://img.test/google-pixel-9-review.jpg">')).imageUrl,
    ).toBe('https://img.test/google-pixel-9-review.jpg');
  });

  it('ignores sizes that are not plain pixels', () => {
    expect(imageOf(content('<img src="https://img.test/wide.jpg" width="100%">')).imageUrl).toBe(
      'https://img.test/wide.jpg',
    );
  });

  it('uses lazy-loading attributes when src is a placeholder', () => {
    expect(
      imageOf(
        content('<img src="data:image/gif;base64,R0lGOD" data-src="https://img.test/lazy.jpg">'),
      ).imageUrl,
    ).toBe('https://img.test/lazy.jpg');
    expect(
      imageOf(
        content(
          '<img src="data:image/gif;base64,R0lGOD" srcset="https://img.test/1x.jpg 1x, https://img.test/2x.jpg 2x">',
        ),
      ).imageUrl,
    ).toBe('https://img.test/1x.jpg');
  });

  it('resolves relative addresses against the story and decodes entities', () => {
    expect(imageOf(content('<img src="../images/a.jpg?w=1&#038;h=2">')).imageUrl).toBe(
      'https://site.test/images/a.jpg?w=1&h=2',
    );
  });
});

describe('rule 4: no image', () => {
  it('returns no image when nothing qualifies', () => {
    expect(imageOf('<description>Just words.</description>')).toEqual({
      imageUrl: null,
      imageSource: null,
    });
  });
});
