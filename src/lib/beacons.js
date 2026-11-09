/**
 * Known trackers and the usual names for pixel and spacer images. Matches
 * whole path segments, so "google-pixel-9.jpg" is still a picture. Shared by
 * the Worker (main images) and the story page (body images).
 */
export const BEACON =
  /\/_\/stat\b|(?:^|[./])(?:doubleclick|feedburner|scorecardresearch|quantserve|google-analytics)\.|\/\/(?:pixel|stats|beacon|track)[.-]|\/(?:pixel|beacon|spacer|blank|1x1|tracker|tracking)(?:\.[a-z]+)?(?:[/?#]|$)/i;

/**
 * A size attribute in pixels, or null when it's missing or not a plain number
 * (e.g. "100%").
 *
 * @param {string|null|undefined} value
 */
export function pixels(value) {
  return value && /^\s*\d+(?:px)?\s*$/i.test(value) ? Number.parseInt(value, 10) : null;
}

/**
 * A tracking pixel: a beacon address, or an image 2 px or smaller.
 *
 * @param {string} url
 * @param {{ width?: string|null, height?: string|null }} size
 */
export function isTrackingPixel(url, { width, height }) {
  const w = pixels(width);
  const h = pixels(height);
  return BEACON.test(url) || (w !== null && w <= 2) || (h !== null && h <= 2);
}
