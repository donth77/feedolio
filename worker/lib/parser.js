import { XMLParser } from 'fast-xml-parser';
import { FeedError } from './errors.js';

/** Elements that can repeat, so they always parse as arrays. */
const ARRAY_TAGS = new Set([
  'item',
  'entry',
  'category',
  'link',
  'enclosure',
  'author',
  'dc:creator',
  'media:content',
  'media:thumbnail',
]);

/**
 * fast-xml-parser turns XML into plain objects; the normaliser does the rest.
 *
 * Text-bearing elements are "stop nodes": the parser keeps their inner XML
 * raw, so CDATA, escaped HTML and inline XHTML each survive intact and are
 * decoded later (see xmlText). Entity expansion is capped by the parser's
 * defaults, which defuses "billion laughs" documents.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  processEntities: true,
  htmlEntities: true,
  stopNodes: [
    '*.title',
    '*.description',
    '*.content:encoded',
    '*.content',
    '*.summary',
    '*.subtitle',
  ],
  isArray: (name) => ARRAY_TAGS.has(name),
});

/**
 * A parsed feed, before normalising.
 *
 * @typedef {Object} FeedDocument
 * @property {'rss'|'atom'|'rdf'} format  RSS 2.0, Atom, or RSS 1.0 (RDF)
 * @property {Record<string, any>} channel  The RSS channel or the Atom feed element
 * @property {Record<string, any>[]} items  RSS items or Atom entries
 */

/**
 * @param {string} xml
 * @returns {FeedDocument}
 */
export function readFeedDocument(xml) {
  /** @type {Record<string, unknown>} */
  let doc;
  try {
    doc = parser.parse(xml);
  } catch {
    throw notAFeed();
  }

  if (Object.hasOwn(doc, 'rss')) {
    const channel = asObject(firstOf(asObject(doc.rss).channel));
    return { format: 'rss', channel, items: arrayOf(channel.item) };
  }
  if (Object.hasOwn(doc, 'feed')) {
    const feed = asObject(doc.feed);
    return { format: 'atom', channel: feed, items: arrayOf(feed.entry) };
  }
  if (Object.hasOwn(doc, 'rdf:RDF')) {
    const rdf = asObject(doc['rdf:RDF']);
    return { format: 'rdf', channel: asObject(firstOf(rdf.channel)), items: arrayOf(rdf.item) };
  }
  throw notAFeed();
}

function notAFeed() {
  return new FeedError('NOT_A_FEED', 'That address isn’t an RSS or Atom feed.');
}

/** @param {unknown} value */
function firstOf(value) {
  return Array.isArray(value) ? value[0] : value;
}

/** @param {unknown} value */
function asObject(value) {
  return value && typeof value === 'object' ? /** @type {Record<string, any>} */ (value) : {};
}

/**
 * Items and entries always parse as arrays (see ARRAY_TAGS); empty elements
 * parse as "" and are dropped.
 *
 * @param {unknown} value
 */
function arrayOf(value) {
  return (Array.isArray(value) ? value : []).filter((item) => item && typeof item === 'object');
}
