/**
 * Searching stories in the browser (ADR-010). Every word and "quoted phrase"
 * in the query must appear; case and accents don't matter.
 *
 * - Short words (up to three letters) must be whole words, give or take a
 *   plural, so "AI" finds "AI" and "AIs" but not "said" or "air".
 * - Longer words match the start of a word, so "chip" finds "chips".
 * - A phrase matches only as written, as whole words.
 *
 * @typedef {import('../feeds/useFeeds.js').ListedStory} ListedStory
 * @typedef {{ titlesOnly?: boolean, since?: number }} SearchOptions
 *   since: only stories published after this time (ms)
 * @typedef {{ test: RegExp, find: RegExp }} Pattern  find: the same, global
 */

/** A letter or digit in any script. */
const WORD = '[\\p{L}\\p{N}]';
/** Short words must be whole words; longer ones match the start of a word. */
const WHOLE_WORD_MAX = 3;

/**
 * Text folded for matching (lower case, accents removed, curly quotes made
 * straight), with where each folded character came from in the original,
 * so matches map back for highlighting.
 *
 * @param {string} text
 * @returns {{ folded: string, starts: number[], ends: number[] }}
 */
export function fold(text) {
  let folded = '';
  /** @type {number[]} */
  const starts = [];
  /** @type {number[]} */
  const ends = [];
  let index = 0;
  for (const char of text) {
    const plain = char
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”„]/g, '"');
    for (let unit = 0; unit < plain.length; unit += 1) {
      starts.push(index);
      ends.push(index + char.length);
    }
    folded += plain;
    index += char.length;
  }
  return { folded, starts, ends };
}

/**
 * The query's words and phrases, as patterns over folded text.
 *
 * @param {string} query
 * @returns {Pattern[]}
 */
export function parseQuery(query) {
  /** @type {Pattern[]} */
  const patterns = [];
  for (const [, phrase, word] of fold(query).folded.matchAll(/"([^"]*)"?|([^\s"]+)/g)) {
    const source = phrase === undefined ? wordSource(word) : phraseSource(phrase);
    if (source) patterns.push({ test: new RegExp(source, 'u'), find: new RegExp(source, 'gu') });
  }
  return patterns;
}

/**
 * Stories that match every word and phrase, newest first. An empty query
 * matches nothing.
 *
 * @param {ListedStory[]} items
 * @param {string} query
 * @param {SearchOptions} [options]
 * @returns {ListedStory[]}
 */
export function searchStories(items, query, { titlesOnly = false, since } = {}) {
  const patterns = parseQuery(query);
  if (patterns.length === 0) return [];
  return items
    .filter(({ story }) => since === undefined || publishedAfter(story.publishedAt, since))
    .filter((item) => {
      const text = searchableText(item, titlesOnly);
      return patterns.every(({ test }) => test.test(text));
    })
    .sort((a, b) => newestFirst(a.story.publishedAt, b.story.publishedAt));
}

/**
 * Where the query's words and phrases appear in a text: [start, end) pairs
 * in the original text, in order, with overlaps merged.
 *
 * @param {string} text
 * @param {string} query
 * @returns {[number, number][]}
 */
export function matchRanges(text, query) {
  const patterns = parseQuery(query);
  if (patterns.length === 0 || !text) return [];
  const { folded, starts, ends } = fold(text);
  /** @type {[number, number][]} */
  const ranges = [];
  for (const { find } of patterns) {
    for (const match of folded.matchAll(find)) {
      const first = /** @type {number} */ (match.index);
      const last = first + match[0].length - 1;
      if (match[0].length > 0) ranges.push([starts[first], ends[last]]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  /** @type {[number, number][]} */
  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

/** Folded text for each story, kept while the story object lives. */
const cache = new WeakMap();

/**
 * @param {ListedStory} item
 * @param {boolean} titlesOnly
 */
function searchableText({ story, feed }, titlesOnly) {
  const cached = cache.get(story);
  const key = titlesOnly ? 'title' : `all:${feed.title}`;
  if (cached?.[key] !== undefined) return cached[key];
  // A separator no word or phrase can match across.
  const text = titlesOnly
    ? story.title
    : [story.title, story.excerpt, story.author, feed.title].filter(Boolean).join('\u0000');
  const folded = fold(text).folded;
  cache.set(story, { ...cached, [key]: folded });
  return folded;
}

/** @param {string} word */
function wordSource(word) {
  // Punctuation at the edges ("AI," or "(chips)") isn't part of the word.
  const trimmed = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (!trimmed) return null;
  const body = escapeRegExp(trimmed);
  return [...trimmed].length <= WHOLE_WORD_MAX
    ? `(?<!${WORD})${body}(?:s|es|'s)?(?!${WORD})`
    : `(?<!${WORD})${body}`;
}

/** @param {string} phrase */
function phraseSource(phrase) {
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return `(?<!${WORD})${words.map(escapeRegExp).join('\\s+')}(?!${WORD})`;
}

/** @param {string} text */
function escapeRegExp(text) {
  // With the u flag only syntax characters (and /) may be escaped.
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * @param {string|null} publishedAt
 * @param {number} since
 */
function publishedAfter(publishedAt, since) {
  return publishedAt !== null && Date.parse(publishedAt) > since;
}

/**
 * Newest first; undated stories last.
 *
 * @param {string|null} a
 * @param {string|null} b
 */
function newestFirst(a, b) {
  const timeA = a ? Date.parse(a) : null;
  const timeB = b ? Date.parse(b) : null;
  if (timeA === timeB) return 0;
  if (timeA === null) return 1;
  if (timeB === null) return -1;
  return timeB - timeA;
}
