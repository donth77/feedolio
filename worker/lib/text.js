/**
 * Small text helpers for feed content. Everything here is linear-time on its
 * input, to stay well inside the Workers CPU limit.
 */

/** Named character references that turn up in feeds. */
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\xa0',
  shy: '\xad',
  ensp: '\u2002',
  emsp: '\u2003',
  thinsp: '\u2009',
  zwnj: '\u200C',
  zwj: '\u200D',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  bull: '•',
  middot: '·',
  prime: '′',
  Prime: '″',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  lsaquo: '‹',
  rsaquo: '›',
  dagger: '†',
  Dagger: '‡',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  minus: '−',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
  micro: 'µ',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  sup2: '²',
  sup3: '³',
  iexcl: '¡',
  iquest: '¿',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  aring: 'å',
  aelig: 'æ',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  igrave: 'ì',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  ograve: 'ò',
  oacute: 'ó',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  oslash: 'ø',
  ugrave: 'ù',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  yacute: 'ý',
  yuml: 'ÿ',
  szlig: 'ß',
  Agrave: 'À',
  Aacute: 'Á',
  Acirc: 'Â',
  Atilde: 'Ã',
  Auml: 'Ä',
  Aring: 'Å',
  AElig: 'Æ',
  Ccedil: 'Ç',
  Egrave: 'È',
  Eacute: 'É',
  Ecirc: 'Ê',
  Euml: 'Ë',
  Igrave: 'Ì',
  Iacute: 'Í',
  Icirc: 'Î',
  Iuml: 'Ï',
  Ntilde: 'Ñ',
  Ograve: 'Ò',
  Oacute: 'Ó',
  Ocirc: 'Ô',
  Otilde: 'Õ',
  Ouml: 'Ö',
  Oslash: 'Ø',
  Ugrave: 'Ù',
  Uacute: 'Ú',
  Ucirc: 'Û',
  Uuml: 'Ü',
  Yacute: 'Ý',
};

/** Browsers read &#128;–&#159; as Windows-1252, and so do feeds that use them. */
const WINDOWS_1252 = {
  128: '€',
  130: '‚',
  131: 'ƒ',
  132: '„',
  133: '…',
  134: '†',
  135: '‡',
  136: 'ˆ',
  137: '‰',
  138: 'Š',
  139: '‹',
  140: 'Œ',
  142: 'Ž',
  145: '‘',
  146: '’',
  147: '“',
  148: '”',
  149: '•',
  150: '–',
  151: '—',
  152: '˜',
  153: '™',
  154: 'š',
  155: '›',
  156: 'œ',
  158: 'ž',
  159: 'Ÿ',
};

/**
 * Decodes HTML character references once. Unknown names are left as they are.
 *
 * @param {string} text
 */
export function decodeEntities(text) {
  if (!text.includes('&')) return text;
  return text.replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/g,
    (match, decimal, hex, name) => {
      if (name) return Object.hasOwn(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : match;
      const code = decimal ? Number(decimal) : parseInt(hex, 16);
      if (Object.hasOwn(WINDOWS_1252, code)) return WINDOWS_1252[code];
      const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
      return valid ? String.fromCodePoint(code) : '\uFFFD';
    },
  );
}

/**
 * The value of an XML text node kept raw by the parser: CDATA sections are
 * taken literally, and everything else has its entities decoded once.
 *
 * @param {string} raw
 */
export function xmlText(raw) {
  if (!raw.includes('<![CDATA[')) return decodeEntities(raw);
  let value = '';
  let last = 0;
  for (const match of raw.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)) {
    value += decodeEntities(raw.slice(last, match.index)) + match[1];
    last = match.index + match[0].length;
  }
  return value + decodeEntities(raw.slice(last));
}

const SKIPPED_BLOCKS =
  /<(script|style|noscript|template|figure|figcaption|iframe|object|svg|math|button|select|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCK_TAGS =
  /<\/?(?:p|div|br|hr|li|ul|ol|dl|dt|dd|h[1-6]|blockquote|pre|table|thead|tbody|tfoot|tr|td|th|section|article|aside|header|footer|nav|main|address|details|summary)\b[^>]*>/gi;

/**
 * Readable plain text from an HTML fragment: no tags, scripts, styles or
 * figure captions, entities decoded, whitespace collapsed. Only the first
 * `maxHtmlLength` characters are read, which is plenty for an excerpt.
 *
 * @param {string} html
 * @param {number} [maxHtmlLength]
 */
export function htmlToText(html, maxHtmlLength = 20_000) {
  if (!html) return '';
  const fragment =
    html.length > maxHtmlLength ? html.slice(0, maxHtmlLength).replace(/<[^>]*$/, '') : html;
  return decodeEntities(
    fragment
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(SKIPPED_BLOCKS, ' ')
      .replace(BLOCK_TAGS, ' ')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Plain text for an excerpt of at most `max` characters. Reads a small slice
 * of the HTML first and more only when that slice is mostly markup.
 *
 * @param {string} html
 * @param {number} max
 */
export function excerptOf(html, max) {
  for (let size = 4_000; ; size *= 4) {
    const text = htmlToText(html, size);
    if (text.length > max || size >= html.length) return truncate(text, max);
  }
}

/**
 * Counts the readable characters in an HTML body, roughly as htmlToText
 * would, but stops as soon as the count passes `limit`. A character
 * reference counts as one character; whitespace runs and tags count as one
 * space.
 *
 * @param {string} html
 * @param {number} [limit]
 */
export function textLength(html, limit = Infinity) {
  let count = 0;
  let pendingSpace = false;
  for (let i = 0; i < html.length && count <= limit; i++) {
    const code = html.charCodeAt(i);
    if (code === 60) {
      // "<": skip the tag.
      const end = html.indexOf('>', i);
      if (end === -1) break;
      i = end;
      pendingSpace = count > 0;
    } else if (code === 32 || code === 9 || code === 10 || code === 13 || code === 160) {
      pendingSpace = count > 0;
    } else {
      if (pendingSpace) {
        count += 1;
        pendingSpace = false;
      }
      if (code === 38) {
        // "&": a character reference such as &amp; or &#8217; is one character.
        const end = html.indexOf(';', i);
        if (end !== -1 && end - i <= 10 && /^&#?[a-z0-9]+;$/i.test(html.slice(i, end + 1))) i = end;
      }
      count += 1;
    }
  }
  return count;
}

/**
 * Shortens text to at most `max` characters, ending on a whole word with "…".
 *
 * @param {string} text
 * @param {number} max
 */
export function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const words = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${words.replace(/[\s,;:.!?–—-]+$/, '')}…`;
}

/**
 * Plain text as safe HTML paragraphs.
 *
 * @param {string} text
 */
export function textToHtml(text) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** @param {string} text */
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/**
 * Attributes of one HTML tag, with names lower-cased and values decoded.
 * The first occurrence of a name wins, as in browsers.
 *
 * @param {string} source  Everything between the tag name and its closing ">"
 * @returns {Record<string, string>}
 */
export function parseAttributes(source) {
  /** @type {Record<string, string>} */
  const attributes = Object.create(null);
  for (const [, name, doubleQuoted, singleQuoted, bare] of source.matchAll(ATTRIBUTE)) {
    const key = name.toLowerCase();
    if (!(key in attributes)) {
      attributes[key] = decodeEntities(doubleQuoted ?? singleQuoted ?? bare ?? '');
    }
  }
  return attributes;
}

/**
 * An absolute http(s) URL, resolved against `base`, or null for anything
 * else (javascript:, data:, mailto:, garbage).
 *
 * @param {unknown} value
 * @param {string|URL} [base]
 */
export function safeHttpUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
