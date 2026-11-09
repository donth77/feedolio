import { hash53 } from './hash.js';
import { normaliseFeedUrl } from './url.js';

/** The five tints from the design canvas, one per starter feed. */
export const TINTS = /** @type {const} */ (['bc', 'ec', 'tc', 'bbc', 'vg']);

/** @typedef {typeof TINTS[number]} Tint */

/** @type {Record<string, Tint>} */
const STARTER_TINTS = {
  'https://medium.com/feed/backchannel': 'bc',
  'https://medium.com/feed/the-economist': 'ec',
  'https://techcrunch.com/category/startups/feed': 'tc',
  'https://feeds.bbci.co.uk/news/technology/rss.xml': 'bbc',
  'https://www.theverge.com/rss/index.xml': 'vg',
};

/**
 * A feed's tint: the design's own for the starter feeds, otherwise one picked
 * from the address, so a feed keeps its colour.
 *
 * @param {string} url
 * @returns {Tint}
 */
export function tintFor(url) {
  const normalised = normaliseFeedUrl(url);
  return STARTER_TINTS[normalised] ?? TINTS[hash53(normalised) % TINTS.length];
}

/**
 * Initials for a feed's tile: the first letters of its first two words,
 * skipping a leading "The". "TechCrunch Startups" → "TS", "The Verge" → "V".
 *
 * @param {string} title
 */
export function monogramFor(title) {
  const words = title
    .replace(/^the\s+/i, '')
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word));
  return (
    words
      .slice(0, 2)
      .map((word) => [...word][0].toUpperCase())
      .join('') || '?'
  );
}

/**
 * A short, readable form of a feed address: "theverge.com/rss/index.xml".
 *
 * @param {string} url
 */
export function displayUrl(url) {
  const { hostname, pathname, search } = new URL(url);
  return `${hostname.replace(/^www\./, '')}${pathname === '/' ? '' : pathname}${search}`.replace(
    /\/$/,
    '',
  );
}
