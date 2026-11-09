// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanStoryHtml, wordCount } from '../../src/features/story/cleanStoryHtml.js';

const STORY = 'https://news.test/2026/11/story';

/**
 * Cleans `html` and puts the result in a detached element, ready to inspect.
 *
 * @param {string} html
 * @param {{ storyUrl?: string|null, heroUrl?: string|null }} [options]
 */
function clean(html, options = {}) {
  const container = document.createElement('div');
  container.append(cleanStoryHtml(html, { storyUrl: STORY, ...options }));
  return container;
}

describe('cleanStoryHtml', () => {
  it('removes scripts, event handlers, styles, forms and code URLs', () => {
    const attacks = [
      '<script>alert(1)</script>',
      '<img src="https://news.test/a.png" onerror="alert(1)" width="300">',
      '<svg onload="alert(1)"><script>alert(1)</script></svg>',
      '<math><mtext><img src=x onerror=alert(1)></mtext></math>',
      '<a href="javascript:alert(1)">js</a>',
      '<a href=" JaVaScRiPt:alert(1)">js2</a>',
      '<a href="vbscript:msgbox(1)">vb</a>',
      '<a href="data:text/html,<script>alert(1)</script>">data</a>',
      '<details open ontoggle="alert(1)"><summary>More</summary>Hidden</details>',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<form action="https://evil.test"><input name="p"><button formaction="javascript:alert(1)">Go</button></form>',
      '<style>body { display: none }</style>',
      '<link rel="stylesheet" href="https://evil.test/x.css">',
      '<meta http-equiv="refresh" content="0;url=https://evil.test">',
      '<base href="https://evil.test/">',
      '<p style="background:url(javascript:alert(1))">styled</p>',
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
      '<template><script>alert(1)</script></template>',
    ];
    const container = clean(attacks.join('\n'));
    const html = container.innerHTML;

    expect(html).not.toMatch(
      /<(?:script|style|form|input|button|link|meta|base|math|iframe|template|noscript)\b/i,
    );
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/javascript:|vbscript:|data:/i);
    // The only SVGs left are Feedolio's own icons on embed cards.
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.closest('[data-embed]')).not.toBeNull();
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
    // Words survive; only their dangerous wrapping goes.
    expect(container.textContent).toContain('styled');
    expect(container.textContent).toContain('js2');
  });

  it('keeps the story’s formatting', () => {
    const container = clean(
      '<h2>Part one</h2><p>Some <strong>bold</strong> and <em>italic</em> text.</p>' +
        '<ul><li>One</li><li>Two</li></ul><blockquote><p>A quote</p></blockquote>' +
        '<figure><img src="https://news.test/chart.png" alt="A chart"><figcaption>Caption</figcaption></figure>' +
        '<pre><code>let x = 1;</code></pre><table><tr><td>Cell</td></tr></table>',
    );

    expect([...container.children].map((element) => element.localName)).toEqual([
      'h2',
      'p',
      'ul',
      'blockquote',
      'figure',
      'pre',
      'table',
    ]);
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('figcaption')?.textContent).toBe('Caption');
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('A chart');
  });

  it('resolves links and images against the story, and opens links in a new tab', () => {
    const container = clean(
      '<p><a href="/about">About</a> <a href="mailto:hi@news.test">Mail</a> ' +
        '<a href="#notes">Notes</a> <a href="https://other.test/" target="_self">Other</a></p>' +
        '<img src="img/a.png">',
    );

    const links = [...container.querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://news.test/about',
      'mailto:hi@news.test',
      'https://news.test/2026/11/story#notes',
      'https://other.test/',
    ]);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }

    const image = /** @type {HTMLImageElement} */ (container.querySelector('img'));
    expect(image.getAttribute('src')).toBe('https://news.test/2026/11/img/a.png');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('decoding')).toBe('async');
    expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(image.getAttribute('alt')).toBe('');
  });

  it('drops relative links and images when the story has no address', () => {
    const container = clean(
      '<p><a href="/about">About</a> <a href="https://other.test/">Other</a></p><img src="a.png">',
      { storyUrl: null },
    );

    const [relative, absolute] = container.querySelectorAll('a');
    expect(relative.hasAttribute('href')).toBe(false);
    expect(absolute.getAttribute('href')).toBe('https://other.test/');
    expect(container.querySelector('img')).toBeNull();
  });

  it('removes tracking pixels, and figures left empty', () => {
    const container = clean(
      '<p>Text</p>' +
        '<img src="https://medium.com/_/stat?event=post.clientViewed&postId=1" width="1" height="1">' +
        '<img src="https://news.test/p.gif" width="1" height="1">' +
        '<img src="https://pixel.wp.com/g.gif?blog=1">' +
        '<figure><img src="https://feeds.feedburner.com/~r/news/~4/abc"></figure>' +
        '<img src="https://news.test/google-pixel-9.jpg" width="800">',
    );

    expect(
      [...container.querySelectorAll('img')].map((image) => image.getAttribute('src')),
    ).toEqual(['https://news.test/google-pixel-9.jpg']);
    expect(container.querySelector('figure')).toBeNull();
  });

  it('removes the first body image when it repeats the hero, at any size', () => {
    const repeated = clean(
      '<figure><img src="https://cdn.test/max/700/abc.jpg"><figcaption>Its caption</figcaption></figure><p>Text</p>',
      { heroUrl: 'https://cdn.test/max/1024/abc.jpg' },
    );
    expect(repeated.querySelector('img')).toBeNull();
    expect(repeated.querySelector('figure')).toBeNull();

    const different = clean(
      '<p>Intro</p><img src="https://cdn.test/a.jpg"><img src="https://cdn.test/hero.jpg">',
      {
        heroUrl: 'https://cdn.test/hero.jpg',
      },
    );
    expect(different.querySelectorAll('img')).toHaveLength(2);
  });

  it('replaces embedded media with a link to the story, even when its fallback is markup', () => {
    const container = clean(
      '<figure><iframe src="https://www.youtube.com/embed/x">' +
        '<a href="https://medium.com/media/1">https://medium.com/media/1</a></iframe></figure>' +
        '<video src="v.mp4"><source src="v.webm"></video><audio src="a.mp3"></audio>' +
        '<object data="x.swf"></object><embed src="x.swf">',
    );

    const cards = container.querySelectorAll('[data-embed]');
    expect(cards).toHaveLength(5);
    for (const card of cards) {
      expect(card.localName).toBe('a');
      expect(card.getAttribute('href')).toBe(STORY);
      expect(card.getAttribute('target')).toBe('_blank');
      expect(card.getAttribute('rel')).toBe('noopener noreferrer');
      expect(card.textContent).toBe('Embedded media Not shown here. View it on news.test');
    }
    expect(container.querySelector('figure [data-embed]')).not.toBeNull();
  });

  it('says what’s missing when there’s no story to link to', () => {
    const card = clean('<iframe src="https://x.test/"></iframe>', { storyUrl: null }).querySelector(
      '[data-embed]',
    );

    expect(card?.localName).toBe('div');
    expect(card?.textContent).toBe('Embedded media Not shown here.');
  });

  it('makes headings follow the story title without skipping levels', () => {
    const container = clean('<h4>Sub</h4><h3>A</h3><h1>B</h1><h5>C</h5><h2> </h2><p>End</p>');

    expect(
      [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(
        (heading) => `${heading.localName} ${heading.textContent}`,
      ),
    ).toEqual(['h2 Sub', 'h3 A', 'h2 B', 'h3 C']);
  });

  it('names links that hold nothing but an unlabelled image', () => {
    const container = clean(
      '<a href="https://www.shop.test/x"><img src="https://shop.test/x.jpg" alt=""></a>' +
        '<a href="https://shop.test/y"><img src="https://shop.test/y.jpg" alt="Blue kettle"></a>',
    );

    const [unlabelled, labelled] = container.querySelectorAll('a');
    expect(unlabelled.getAttribute('aria-label')).toBe('Link to shop.test');
    expect(labelled.hasAttribute('aria-label')).toBe(false);
  });

  it('puts plain text in a paragraph', () => {
    expect(clean('Just a summary, with no markup.').innerHTML).toBe(
      '<p>Just a summary, with no markup.</p>',
    );
    expect(clean('<p>Already a paragraph.</p>').innerHTML).toBe('<p>Already a paragraph.</p>');
    expect(clean('   ').innerHTML).toBe('   ');
  });

  it('removes attributes that would let a feed restyle the page or change how it behaves', () => {
    const container = clean(
      '<p class="x" id="y" data-x="1" aria-hidden="true" tabindex="0" role="button" ' +
        'popover="auto">Text</p>' +
        '<a href="https://a.test/" download ping="https://evil.test/">Link</a>' +
        '<img src="https://a.test/i.jpg" srcset="https://evil.test/i.jpg 2x" sizes="100vw">',
    );

    expect(container.querySelector('p')?.attributes).toHaveLength(0);
    const link = /** @type {HTMLAnchorElement} */ (container.querySelector('a'));
    expect(link.hasAttribute('download')).toBe(false);
    expect(link.hasAttribute('ping')).toBe(false);
    const image = /** @type {HTMLImageElement} */ (container.querySelector('img'));
    expect(image.hasAttribute('srcset')).toBe(false);
    expect(image.hasAttribute('sizes')).toBe(false);
  });
});

describe('wordCount', () => {
  it('counts the words a reader will read', () => {
    expect(
      wordCount(cleanStoryHtml('<p>One two  three</p>\n<p>four</p>', { storyUrl: STORY })),
    ).toBe(4);
    expect(wordCount(cleanStoryHtml('', { storyUrl: STORY }))).toBe(0);
  });
});
