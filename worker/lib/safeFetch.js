import { FeedError } from './errors.js';
import { checkAddress } from './urlGuard.js';

/** Sent with every upstream request. */
export const USER_AGENT = 'FeedolioReader/1.0';
const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5';

const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
/** A feed larger than this is refused. */
export const FEED_BYTE_LIMIT = 5 * 1024 * 1024;
/** Only this much of a web page is read when looking for its feed links. */
export const PAGE_BYTE_LIMIT = 1024 * 1024;
const SNIFF_BYTES = 1024;

/**
 * One request's shared limits: a single 8-second deadline and a single
 * redirect budget, used by every upstream fetch the request makes
 * (the pasted page, then its feed).
 *
 * @typedef {{ signal: AbortSignal, redirectsLeft: number, dispose: () => void }} FetchBudget
 */

/** @returns {FetchBudget} */
export function createBudget() {
  const controller = new AbortController();
  // setTimeout rather than AbortSignal.timeout(), so tests can fake the clock.
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return {
    signal: controller.signal,
    redirectsLeft: MAX_REDIRECTS,
    dispose: () => clearTimeout(timer),
  };
}

/**
 * A fetched document, read and decoded.
 *
 * @typedef {Object} UpstreamDocument
 * @property {'feed'|'page'} kind  A feed to parse, or a web page to search for feed links
 * @property {string} text
 * @property {URL} url  Where it was finally found, after redirects
 */

/**
 * Fetches `url` safely and reads it: redirects are followed by hand so every
 * hop is checked, the body is streamed and capped, and the result is sorted
 * into a feed, a web page, or neither (NOT_A_FEED).
 *
 * @param {URL} url
 * @param {FetchBudget} budget
 * @returns {Promise<UpstreamDocument>}
 */
export async function fetchDocument(url, budget) {
  const { response, finalUrl } = await followRedirects(url, budget);
  const contentType = (response.headers.get('Content-Type') ?? '').toLowerCase();
  const declaredLength = Number(response.headers.get('Content-Length') ?? NaN);

  const reader = response.body?.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let size = 0;
  /** @type {'feed'|'page'|'other'|null} */
  let kind = null;

  try {
    while (reader) {
      const { done, value } = await withDeadline(reader.read(), budget, 'reading');
      if (done) break;
      chunks.push(value);
      size += value.byteLength;

      if (kind === null && size >= SNIFF_BYTES) {
        kind = sniffKind(contentType, decode(join(chunks, size), contentType));
        if (kind === 'other') throw notAFeed();
        if (kind === 'feed' && declaredLength > FEED_BYTE_LIMIT) throw tooLarge();
      }
      if (kind === 'page' && size >= PAGE_BYTE_LIMIT) break;
      if (size > FEED_BYTE_LIMIT) throw tooLarge();
    }
  } finally {
    // Stops the download when we leave early; harmless after the last chunk.
    reader?.cancel().catch(() => {});
  }

  const bytes = join(chunks, kind === 'page' ? Math.min(size, PAGE_BYTE_LIMIT) : size);
  const text = decode(bytes, contentType);
  kind ??= sniffKind(contentType, text);
  if (kind === 'other') throw notAFeed();
  return { kind, text, url: finalUrl };
}

/**
 * @param {URL} url
 * @param {FetchBudget} budget
 * @returns {Promise<{ response: Response, finalUrl: URL }>}
 */
async function followRedirects(url, budget) {
  let current = url;
  for (;;) {
    checkAddress(current);
    const response = await withDeadline(
      fetch(current.href, {
        redirect: 'manual',
        signal: budget.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: ACCEPT },
      }),
      budget,
      'connecting',
    );

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('Location');
      await response.body?.cancel().catch(() => {});
      if (!location) {
        throw new FeedError('UPSTREAM_ERROR', 'The site redirected without saying where to.', {
          upstreamStatus: response.status,
        });
      }
      if (budget.redirectsLeft === 0) {
        throw new FeedError('UPSTREAM_ERROR', 'The site redirected too many times.');
      }
      budget.redirectsLeft -= 1;
      try {
        current = new URL(location, current);
      } catch {
        throw new FeedError(
          'UPSTREAM_ERROR',
          'The site redirected to an address that isn’t valid.',
        );
      }
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new FeedError(
        'UPSTREAM_ERROR',
        `The site answered with an error (${response.status}).`,
        { upstreamStatus: response.status },
      );
    }
    return { response, finalUrl: current };
  }
}

/**
 * Waits for `promise`, but gives up when the request's deadline passes.
 * Network failures become UPSTREAM_ERROR.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {FetchBudget} budget
 * @param {'connecting'|'reading'} stage
 * @returns {Promise<T>}
 */
function withDeadline(promise, { signal }, stage) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(timedOut());
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise
      .then(resolve, (error) => {
        if (signal.aborted) reject(timedOut());
        else if (error instanceof FeedError) reject(error);
        else
          reject(
            new FeedError(
              'UPSTREAM_ERROR',
              stage === 'connecting'
                ? 'Couldn’t connect to the site.'
                : 'The connection dropped while reading the site.',
            ),
          );
      })
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

const FEED_START =
  /^(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*|<\?[\s\S]*?\?>\s*|<!doctype[^>[]*(?:\[[\s\S]*?\])?\s*>\s*)*<(?:rss|feed|rdf:rdf)[\s>]/;
const PAGE_START =
  /^(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:!doctype\s+html|html|head|body|meta|title)[\s>]/;

/**
 * Decides what a response holds from its first bytes and its Content-Type.
 * The body wins over the header, because servers often send feeds as
 * text/html and error pages as XML.
 *
 * @param {string} contentType  Lower case
 * @param {string} text  At least the first kilobyte, decoded
 * @returns {'feed'|'page'|'other'}
 */
export function sniffKind(contentType, text) {
  // trimStart() also drops a byte-order mark.
  const start = text.trimStart().slice(0, SNIFF_BYTES).toLowerCase();
  if (FEED_START.test(start)) return 'feed';
  if (PAGE_START.test(start)) return 'page';
  if (/^(?:text\/html|application\/xhtml\+xml)/.test(contentType)) return 'page';
  if (/[+/]xml\b/.test(contentType) || start.startsWith('<')) return 'feed';
  return 'other';
}

/**
 * @param {Uint8Array[]} chunks
 * @param {number} length  Bytes to keep
 */
function join(chunks, length) {
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= length) break;
    const part = chunk.subarray(0, length - offset);
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

/**
 * Decodes with the charset from the Content-Type, else the one in the XML
 * declaration, else UTF-8. An unknown charset falls back to UTF-8.
 *
 * @param {Uint8Array} bytes
 * @param {string} contentType
 */
function decode(bytes, contentType) {
  const charset =
    /charset\s*=\s*"?([\w.:-]+)/i.exec(contentType)?.[1] ??
    /^\s*<\?xml[^>]*\bencoding\s*=\s*["']([\w.:-]+)/i.exec(
      String.fromCharCode(...bytes.subarray(0, 200)),
    )?.[1] ??
    'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function timedOut() {
  return new FeedError('UPSTREAM_TIMEOUT', 'The site took longer than 8 seconds to answer.');
}

function notAFeed() {
  return new FeedError('NOT_A_FEED', 'That address isn’t an RSS or Atom feed.');
}

function tooLarge() {
  return new FeedError('TOO_LARGE', 'That feed is larger than 5 MB, so Feedolio can’t read it.');
}
