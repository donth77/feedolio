/**
 * cyrb53, a small, fast, well-spread 53-bit string hash (public domain, by
 * bryc). Not cryptographic: it only makes stable ids.
 *
 * @param {string} text
 * @returns {number}
 */
export function hash53(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * A short, URL-safe id that is always the same for the same text,
 * e.g. shortId('s', 'https://example.com/post') → "s_1x9k2m4q0b7".
 *
 * @param {string} prefix
 * @param {string} text
 */
export function shortId(prefix, text) {
  return `${prefix}_${hash53(text).toString(36)}`;
}
