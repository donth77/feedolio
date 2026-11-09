import { shortId } from '../../src/lib/hash.js';
import { feedIdFor } from '../../src/lib/url.js';
import { pickMainImage } from './pickMainImage.js';
import {
  excerptOf,
  htmlToText,
  safeHttpUrl,
  textLength,
  textToHtml,
  truncate,
  xmlText,
} from './text.js';

/** @typedef {import('../../src/lib/types.js').Story} Story */
/** @typedef {import('../../src/lib/types.js').FeedResponse} FeedResponse */

const EXCERPT_LENGTH = 200;

/**
 * @typedef {Object} FeedContext
 * @property {string} feedUrl  The feed's own address; its id comes from this
 * @property {string} baseUrl  Where it was finally fetched from; resolves relative links
 * @property {string|null} siteUrl
 * @property {string} feedId
 * @property {string|null} feedAuthor  Atom entries inherit the feed's author
 */

/**
 * Turns a parsed RSS 2.0, RSS 1.0 or Atom document into one FeedResponse.
 *
 * @param {import('./parser.js').FeedDocument} document
 * @param {{ feedUrl: string, baseUrl?: string, fetchedAt: string }} options
 * @returns {FeedResponse}
 */
export function normaliseFeed(
  { format, channel, items },
  { feedUrl, baseUrl = feedUrl, fetchedAt },
) {
  const atom = format === 'atom';
  const siteUrl = atom
    ? alternateLink(channel.link, baseUrl)
    : safeHttpUrl(firstText(channel.link), baseUrl);
  /** @type {FeedContext} */
  const context = {
    feedUrl,
    baseUrl,
    siteUrl,
    feedId: feedIdFor(feedUrl),
    feedAuthor: atom ? authorNames(channel.author) : null,
  };

  /** @type {Story[]} */
  const stories = [];
  const seen = new Set();
  for (const item of items) {
    const story = atom ? atomStory(item, context) : rssStory(item, context);
    if (seen.has(story.id)) continue;
    seen.add(story.id);
    stories.push(story);
  }

  const image = atom
    ? textOf(channel.logo) || textOf(channel.icon)
    : textOf(first(channel.image)?.url) || channel['itunes:image']?.['@_href'];

  return {
    feed: {
      id: context.feedId,
      url: feedUrl,
      title: plainText(channel.title) || hostOf(siteUrl ?? feedUrl),
      description: plainText(atom ? channel.subtitle : channel.description),
      siteUrl,
      imageUrl: safeHttpUrl(image, baseUrl),
      postsPerWeek: postsPerWeek(stories),
    },
    stories,
    fetchedAt,
  };
}

/**
 * RSS 2.0 and RSS 1.0 items.
 *
 * @param {Record<string, any>} item
 * @param {FeedContext} context
 */
function rssStory(item, context) {
  const content = htmlValue(item['content:encoded']);
  const description = htmlValue(item.description);
  const guidNode = item.guid;
  const guid = textOf(guidNode).trim() || String(item['@_rdf:about'] ?? '').trim();
  const guidIsPermalink = String(guidNode?.['@_isPermaLink'] ?? 'true').toLowerCase() !== 'false';

  return buildStory(item, context, {
    guid,
    ownLink:
      safeHttpUrl(firstText(item.link), context.baseUrl) ??
      (guidIsPermalink && /^https?:\/\//i.test(guid) ? safeHttpUrl(guid) : null),
    date: textOf(item.pubDate) || textOf(item['dc:date']),
    title: item.title,
    author: authorNames(item['dc:creator']) ?? rssAuthor(item.author),
    categories: list(item.category),
    contentHtml: content || description,
    summaryHtml: content ? description : '',
  });
}

/**
 * @param {Record<string, any>} entry
 * @param {FeedContext} context
 */
function atomStory(entry, context) {
  const content = atomHtml(entry.content);
  const summary = atomHtml(entry.summary);
  const guid = textOf(entry.id).trim();

  return buildStory(entry, context, {
    guid,
    ownLink:
      alternateLink(entry.link, context.baseUrl) ??
      (/^https?:\/\//i.test(guid) ? safeHttpUrl(guid) : null),
    date: textOf(entry.published) || textOf(entry.updated),
    title: entry.title,
    author: authorNames(entry.author) ?? context.feedAuthor,
    categories: list(entry.category).map((category) =>
      category && typeof category === 'object'
        ? (category['@_label'] ?? category['@_term'])
        : category,
    ),
    contentHtml: content || summary,
    summaryHtml: content ? summary : '',
  });
}

/**
 * @param {Record<string, any>} item
 * @param {FeedContext} context
 * @param {{ guid: string, ownLink: string|null, date: string, title: unknown, author: string|null,
 *   categories: unknown[], contentHtml: string, summaryHtml: string }} fields
 * @returns {Story}
 */
function buildStory(item, context, fields) {
  const { guid, ownLink, date, contentHtml, summaryHtml } = fields;
  const excerpt = excerptOf(summaryHtml || contentHtml, EXCERPT_LENGTH);
  const fullContentThreshold = Math.max(400, 1.5 * textLength(summaryHtml));
  const title = plainText(fields.title) || truncate(excerpt, 100) || 'Untitled story';
  const { imageUrl, imageSource } = pickMainImage(item, {
    contentHtml,
    baseUrl: ownLink ?? context.baseUrl,
  });

  return {
    id: storyId(context.feedUrl, { guid, link: ownLink, title, date }),
    feedId: context.feedId,
    title,
    link: ownLink ?? context.siteUrl ?? context.feedUrl,
    author: fields.author,
    publishedAt: parseDate(date),
    categories: [...new Set(fields.categories.map(plain).filter(Boolean))],
    excerpt,
    contentHtml,
    // Summary-only feeds repeat the summary as the body; a full story has
    // clearly more text than its summary, and more than a few sentences.
    hasFullContent: textLength(contentHtml, fullContentThreshold) > fullContentThreshold,
    imageUrl,
    imageSource,
  };
}

/**
 * Stable across fetches. A guid that is a URL, URN or tag URI is global, so
 * the same story in two feeds gets one id; any other guid is only unique
 * within its feed.
 *
 * @param {string} feedUrl
 * @param {{ guid: string, link: string|null, title: string, date: string }} source
 */
function storyId(feedUrl, { guid, link, title, date }) {
  if (guid) return shortId('s', /^(?:https?|urn|tag):/i.test(guid) ? guid : `${feedUrl}\n${guid}`);
  if (link) return shortId('s', link);
  return shortId('s', `${feedUrl}\n${title}\n${date}`);
}

/**
 * (Dated stories − 1) ÷ days between the newest and oldest × 7, rounded.
 *
 * @param {Story[]} stories
 * @returns {number|null}  null with fewer than two dated stories
 */
function postsPerWeek(stories) {
  const times = stories.map((story) => Date.parse(story.publishedAt ?? '')).filter(Number.isFinite);
  if (times.length < 2) return null;
  const days = (Math.max(...times) - Math.min(...times)) / 86_400_000;
  return days > 0 ? Math.round(((times.length - 1) / days) * 7) : null;
}

/** @param {string} value */
function parseDate(value) {
  const time = Date.parse(value.trim());
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/**
 * HTML from an RSS element kept raw by the parser.
 *
 * @param {unknown} node
 */
function htmlValue(node) {
  return xmlText(textOf(node)).trim();
}

/**
 * HTML from an Atom text construct, by its type: html (escaped or CDATA),
 * xhtml (inline markup) or text.
 *
 * @param {unknown} node
 */
function atomHtml(node) {
  if (node === undefined || node === null || node === '') return '';
  const attributes = typeof node === 'object' ? /** @type {Record<string, any>} */ (node) : {};
  if (attributes['@_src']) return ''; // Content that lives elsewhere.
  const type = String(attributes['@_type'] ?? 'text').toLowerCase();
  const raw = textOf(node);

  if (type === 'xhtml')
    return raw
      .trim()
      .replace(/^<div\b[^>]*>([\s\S]*)<\/div>$/i, '$1')
      .trim();
  const value = xmlText(raw).trim();
  if (type === 'html' || type === 'text/html') return value;
  if (type === 'text' || type === 'text/plain') {
    // Many feeds label HTML as text; trust the markup when real tags are there.
    return COMMON_TAG.test(value) ? value : textToHtml(value);
  }
  return '';
}

const COMMON_TAG =
  /<\/?(?:p|br|a|div|span|img|strong|em|b|i|u|ul|ol|li|h[1-6]|blockquote|figure|pre|code|table)\b[^>]*>/i;

/**
 * Plain text from a title or description kept raw by the parser.
 *
 * @param {unknown} node
 */
function plainText(node) {
  const raw = textOf(node);
  if (!raw) return '';
  const isXhtml = typeof node === 'object' && String(node?.['@_type']).toLowerCase() === 'xhtml';
  return htmlToText(isXhtml ? raw : xmlText(raw), 5_000);
}

/**
 * Plain text from an ordinary parsed value (author, category).
 *
 * @param {unknown} value
 */
function plain(value) {
  return htmlToText(textOf(value), 2_000);
}

/**
 * @param {unknown} value  dc:creator or Atom author elements
 * @returns {string|null}
 */
function authorNames(value) {
  const names = list(value)
    .map((author) =>
      plain(author && typeof author === 'object' && 'name' in author ? author.name : author),
    )
    .filter(Boolean);
  return names.length > 0 ? [...new Set(names)].join(', ') : null;
}

/**
 * RSS <author> holds an email address, often with the name in brackets:
 * "jo@example.com (Jo Bloggs)". Bare addresses aren't shown.
 *
 * @param {unknown} value
 */
function rssAuthor(value) {
  const text = plain(list(value)[0]);
  const named = /\(([^)]+)\)/.exec(text)?.[1]?.trim();
  if (named) return named;
  return !text || /^\S+@\S+$/.test(text) ? null : text;
}

/**
 * The page link from Atom <link> elements: rel="alternate" (the default),
 * HTML first.
 *
 * @param {unknown} links
 * @param {string} base
 */
function alternateLink(links, base) {
  const all = list(links);
  const rel = (/** @type {any} */ link) =>
    (typeof link === 'object' && link['@_rel']) || 'alternate';
  const href = (/** @type {any} */ link) => (typeof link === 'object' ? link?.['@_href'] : link);
  const chosen =
    all.find(
      (link) => rel(link) === 'alternate' && /html/i.test(link?.['@_type'] ?? 'text/html'),
    ) ?? all.find((link) => rel(link) === 'alternate');
  return safeHttpUrl(href(chosen), base);
}

/**
 * The first non-empty text among RSS <link> elements.
 *
 * @param {unknown} links
 */
function firstText(links) {
  for (const link of list(links)) {
    const text = textOf(link).trim() || (typeof link === 'object' ? link?.['@_href'] : '');
    if (text) return text;
  }
  return '';
}

/**
 * @param {unknown} node
 * @returns {string}
 */
function textOf(node) {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return textOf(node[0]);
  if (node && typeof node === 'object') return textOf(/** @type {any} */ (node)['#text'] ?? '');
  return '';
}

/** @param {string} url */
function hostOf(url) {
  return new URL(url).hostname.replace(/^www\./, '');
}

/** @param {unknown} value */
function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

/** @param {unknown} value */
function list(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}
