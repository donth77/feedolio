import { shortId } from './hash.js';

/**
 * The form of a feed address used to spot duplicates and to build feed ids:
 * lower-case host, no default port, no fragment and no trailing slash.
 * The app and the Worker share it, so both derive the same ids.
 * Throws a TypeError if the input isn't an absolute URL.
 *
 * @param {string} input
 */
export function normaliseFeedUrl(input) {
  const url = new URL(input);
  url.hash = '';
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href;
}

/**
 * The id of the feed at `url`, e.g. "f_2xk4m9q0bz1".
 *
 * @param {string} url
 */
export function feedIdFor(url) {
  return shortId('f', normaliseFeedUrl(url));
}
