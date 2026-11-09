import DOMPurify from 'dompurify';
import { isTrackingPixel } from '../../lib/beacons.js';

/** Embedded media Feedolio won't show; each becomes a link to the original. */
const EMBEDS = ['iframe', 'video', 'audio', 'object', 'embed'];

/**
 * Removed outright, on top of what DOMPurify already removes (scripts and
 * anything that can run code). DOMPurify keeps the text inside removed
 * elements, except for elements like style and svg whose content is never
 * reading text.
 */
const FORBIDDEN_TAGS = [
  'style',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'svg',
  'math',
  'canvas',
  'map',
  'area',
  'source',
  'track',
  'link',
  'meta',
  'base',
  'noscript',
  'template',
  'dialog',
];

/**
 * Attributes removed on top of DOMPurify's defaults (which already remove
 * event handlers). Feeds don't get to style the page, move focus, change roles,
 * open popovers or start downloads. Links and images get their own attributes
 * below.
 */
const FORBIDDEN_ATTRIBUTES = [
  'style',
  'class',
  'id',
  'srcset',
  'sizes',
  'target',
  'tabindex',
  'role',
  'download',
  'ping',
  'background',
  'popover',
  'popovertarget',
  'popovertargetaction',
];

// Embedded media is replaced after sanitising. Its fallback content (Medium
// puts a link there, which the parser keeps as raw text) looks like markup to
// DOMPurify, which would then drop the element without a trace, so it's
// emptied first. This only ever removes content.
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (EMBEDS.includes(data.tagName)) node.replaceChildren();
});

/** Block-level elements: a body without any is plain text, and gets a paragraph. */
const BLOCKS =
  'p,div,h1,h2,h3,h4,h5,h6,ul,ol,dl,figure,blockquote,pre,table,hr,section,article,aside';

/**
 * Feed HTML made safe to show. Feed content is untrusted, so:
 * - scripts, styles, forms, event handlers and unsafe URLs are removed
 *   (DOMPurify, then our own checks);
 * - links resolve against the story's page and open in a new tab;
 * - images load lazily without a referrer; tracking pixels are dropped;
 * - embedded media becomes a "View it on {site}" link to the original;
 * - an image repeated as the hero above the body is removed from it;
 * - headings follow on from the story title, the page's h1, in order.
 *
 * Returns DOM nodes rather than an HTML string, so nothing is ever parsed
 * from a string the page didn't sanitise (and Trusted Types stay happy). The
 * nodes belong to an inert document until they're shown, so nothing loads
 * before then.
 *
 * @param {string} html
 * @param {{ storyUrl: string|null, heroUrl?: string|null }} options
 *   storyUrl: the publisher's page; relative links and images resolve
 *   against it (and are dropped without it)
 * @returns {DocumentFragment}
 */
export function cleanStoryHtml(html, { storyUrl, heroUrl = null }) {
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ADD_TAGS: EMBEDS, // Kept only long enough to be replaced below.
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: FORBIDDEN_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });

  for (const embed of fragment.querySelectorAll(EMBEDS.join(','))) {
    embed.replaceWith(embedLink(storyUrl));
  }

  for (const link of fragment.querySelectorAll('a:not([data-embed])')) {
    const href = safeUrl(link.getAttribute('href'), storyUrl, ['http:', 'https:', 'mailto:']);
    if (!href) {
      link.removeAttribute('href');
      continue;
    }
    link.setAttribute('href', href);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  }

  for (const image of fragment.querySelectorAll('img')) {
    const src = safeUrl(image.getAttribute('src'), storyUrl, ['http:', 'https:']);
    if (
      !src ||
      isTrackingPixel(src, {
        width: image.getAttribute('width'),
        height: image.getAttribute('height'),
      })
    ) {
      removeImage(image);
      continue;
    }
    image.setAttribute('src', src);
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');
    image.setAttribute('referrerpolicy', 'no-referrer');
    if (!image.hasAttribute('alt')) image.setAttribute('alt', '');
  }

  if (heroUrl) {
    const first = fragment.querySelector('img');
    if (first && sameImage(first.getAttribute('src'), heroUrl)) removeImage(first);
  }

  fixHeadings(fragment);

  // A link around nothing but an unlabelled image still needs a name.
  for (const link of fragment.querySelectorAll('a[href]:not([data-embed])')) {
    if (link.textContent?.trim() || link.querySelector('img:not([alt=""])')) continue;
    link.setAttribute('aria-label', `Link to ${new URL(link.href).hostname.replace(/^www\./, '')}`);
  }

  if (!fragment.querySelector(BLOCKS) && fragment.textContent?.trim()) {
    const paragraph = document.createElement('p');
    paragraph.append(...fragment.childNodes);
    fragment.append(paragraph);
  }
  return fragment;
}

/**
 * Makes the body's headings follow on from the story title (the page's h1)
 * without skipping levels, so moving by heading with a screen reader works.
 * Feeds often start with an h4 subtitle or jump from h2 to h4. Empty headings
 * are unwrapped, keeping anything inside them, such as an image.
 *
 * @param {DocumentFragment} fragment
 */
function fixHeadings(fragment) {
  let previous = 1;
  for (const heading of fragment.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (!heading.textContent?.trim()) {
      heading.replaceWith(...heading.childNodes);
      continue;
    }
    const level = Number(heading.tagName[1]);
    const fixed = Math.min(Math.max(level, 2), previous + 1);
    previous = fixed;
    if (fixed === level) continue;
    const replacement = document.createElement(`h${fixed}`);
    replacement.append(...heading.childNodes);
    heading.replaceWith(replacement);
  }
}

/** Words in the body, for the reading time. @param {DocumentFragment} fragment */
export function wordCount(fragment) {
  return (fragment.textContent ?? '').split(/\s+/).filter(Boolean).length;
}

/**
 * @param {string|null} value
 * @param {string|null} base
 * @param {string[]} protocols
 */
function safeUrl(value, base, protocols) {
  if (!value) return null;
  try {
    const url = new URL(value, base ?? undefined);
    return protocols.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The same picture at possibly different sizes: same host and file name.
 * Image services put the size in the path or the query (Medium's /max/1024/,
 * BBC's /ace/standard/240/, WordPress's ?w=).
 *
 * @param {string|null} a
 * @param {string} b
 */
function sameImage(a, b) {
  const key = (/** @type {string} */ url) => {
    try {
      const { host, pathname } = new URL(url);
      return `${host} ${pathname.split('/').pop() || pathname}`;
    } catch {
      return url;
    }
  };
  return a !== null && key(a) === key(b);
}

/**
 * Removes an image, and the figure around it when nothing else is left in it.
 *
 * @param {Element} image
 */
function removeImage(image) {
  const figure = image.closest('figure');
  image.remove();
  if (figure && !figure.querySelector('img, [data-embed]')) figure.remove();
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * A card linking to the original story, in place of embedded media. Without
 * a link to the story, it just says what's missing.
 *
 * @param {string|null} storyUrl
 */
function embedLink(storyUrl) {
  const link = document.createElement(storyUrl ? 'a' : 'div');
  if (link instanceof HTMLAnchorElement && storyUrl) {
    link.href = storyUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  link.dataset.embed = '';

  const icon = document.createElementNS(SVG, 'svg');
  for (const [name, value] of Object.entries({
    width: '22',
    height: '22',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.7',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  })) {
    icon.setAttribute(name, value);
  }
  const frame = document.createElementNS(SVG, 'rect');
  for (const [name, value] of Object.entries({
    x: '3',
    y: '5',
    width: '18',
    height: '14',
    rx: '2',
  })) {
    frame.setAttribute(name, value);
  }
  const play = document.createElementNS(SVG, 'path');
  play.setAttribute('d', 'M10 9.5v5l4.5-2.5z');
  icon.append(frame, play);

  const text = document.createElement('span');
  const title = document.createElement('strong');
  title.textContent = 'Embedded media';
  const where = document.createElement('span');
  where.textContent = storyUrl
    ? `Not shown here. View it on ${new URL(storyUrl).hostname.replace(/^www\./, '')}`
    : 'Not shown here.';
  text.append(title, ' ', where);

  link.append(icon, text);
  return link;
}
