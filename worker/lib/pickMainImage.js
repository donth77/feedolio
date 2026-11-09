import { parseAttributes, safeHttpUrl } from './text.js';

/**
 * @typedef {{ imageUrl: string|null, imageSource: 'media'|'enclosure'|'content'|null }} MainImage
 */

/**
 * Picks a story's main image. The first rule that matches wins:
 *
 * 1. `media:content` (images only) or `media:thumbnail`, largest width first.
 * 2. An image enclosure (RSS `<enclosure>` or Atom `<link rel="enclosure">`).
 * 3. The first real `<img>` in the body, `<figure>` images first. Tracking
 *    pixels, beacons, `data:` URIs and icon-sized images are skipped.
 * 4. None: the app shows the feed's monogram tile. The feed logo is never used.
 *
 * @param {Record<string, any>} item  A parsed RSS item or Atom entry
 * @param {{ contentHtml: string, baseUrl: string }} context  baseUrl resolves relative addresses
 * @returns {MainImage}
 */
export function pickMainImage(item, { contentHtml, baseUrl }) {
  const media = largestMediaImage(item, baseUrl);
  if (media) return { imageUrl: media, imageSource: 'media' };

  const enclosure = imageEnclosure(item, baseUrl);
  if (enclosure) return { imageUrl: enclosure, imageSource: 'enclosure' };

  const inline = firstContentImage(contentHtml, baseUrl);
  if (inline) return { imageUrl: inline, imageSource: 'content' };

  return { imageUrl: null, imageSource: null };
}

/**
 * @param {Record<string, any>} item
 * @param {string} baseUrl
 */
function largestMediaImage(item, baseUrl) {
  const groups = [item, ...list(item['media:group'])];
  const candidates = groups.flatMap((group) => [
    ...list(group['media:content']).filter(isImageMedia),
    ...list(group['media:thumbnail']),
  ]);

  let best = null;
  let bestWidth = -1;
  for (const candidate of candidates) {
    const url = safeHttpUrl(candidate?.['@_url'], baseUrl);
    const width = Number.parseInt(candidate?.['@_width'], 10) || 0;
    if (url && width > bestWidth) {
      best = url;
      bestWidth = width;
    }
  }
  return best;
}

/** @param {Record<string, any>} media */
function isImageMedia(media) {
  const medium = String(media?.['@_medium'] ?? '').toLowerCase();
  const type = String(media?.['@_type'] ?? '').toLowerCase();
  if (medium) return medium === 'image';
  if (type) return type.startsWith('image/');
  return /\.(?:jpe?g|png|gif|webp|avif)(?:[?#]|$)/i.test(String(media?.['@_url'] ?? ''));
}

/**
 * @param {Record<string, any>} item
 * @param {string} baseUrl
 */
function imageEnclosure(item, baseUrl) {
  const isImage = (/** @type {unknown} */ type) => /^image\//i.test(String(type ?? ''));
  for (const enclosure of list(item.enclosure)) {
    if (isImage(enclosure?.['@_type'])) {
      const url = safeHttpUrl(enclosure['@_url'], baseUrl);
      if (url) return url;
    }
  }
  for (const link of list(item.link)) {
    if (link?.['@_rel'] === 'enclosure' && isImage(link['@_type'])) {
      const url = safeHttpUrl(link['@_href'], baseUrl);
      if (url) return url;
    }
  }
  return null;
}

const IMG_TAG = /<img\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const FIGURE = /<figure\b[^>]*>([\s\S]*?)<\/figure\s*>/gi;

/**
 * Known trackers and the usual names for pixel and spacer images. Matches
 * whole path segments, so "google-pixel-9.jpg" is still a picture.
 */
const BEACON =
  /\/_\/stat\b|(?:^|[./])(?:doubleclick|feedburner|scorecardresearch|quantserve|google-analytics)\.|\/\/(?:pixel|stats|beacon|track)[.-]|\/(?:pixel|beacon|spacer|blank|1x1|tracker|tracking)(?:\.[a-z]+)?(?:[/?#]|$)/i;

/**
 * @param {string} html
 * @param {string} baseUrl
 */
function firstContentImage(html, baseUrl) {
  if (!html || !html.includes('<img')) return null;
  for (const figure of html.matchAll(FIGURE)) {
    const url = firstUsableImage(figure[1], baseUrl);
    if (url) return url;
  }
  return firstUsableImage(html, baseUrl);
}

/**
 * @param {string} html
 * @param {string} baseUrl
 */
function firstUsableImage(html, baseUrl) {
  for (const tag of html.matchAll(IMG_TAG)) {
    const url = usableImageUrl(parseAttributes(tag[1]), baseUrl);
    if (url) return url;
  }
  return null;
}

/**
 * @param {Record<string, string>} attributes
 * @param {string} baseUrl
 */
function usableImageUrl(attributes, baseUrl) {
  const width = pixels(attributes.width);
  const height = pixels(attributes.height);
  if ((width !== null && width <= 2) || (height !== null && height <= 2)) return null;
  if (width !== null && width < 120) return null;

  const lazy = attributes['data-src'] ?? attributes['data-lazy-src'];
  const fromSrcset = attributes.srcset?.trim().split(/\s+/)[0];
  const sources = [attributes.src, lazy, fromSrcset].filter(
    (source) => source && !source.trim().toLowerCase().startsWith('data:'),
  );
  const url = safeHttpUrl(sources[0], baseUrl);
  return url && !BEACON.test(url) ? url : null;
}

/**
 * A size attribute in pixels, or null when it is missing or not a plain number
 * (e.g. "100%").
 *
 * @param {string|undefined} value
 */
function pixels(value) {
  return value && /^\s*\d+(?:px)?\s*$/i.test(value) ? Number.parseInt(value, 10) : null;
}

/** @param {unknown} value */
function list(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}
