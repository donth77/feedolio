/**
 * The parts of adding a feed that don't need React: reading what the reader
 * typed, describing how often a feed posts, and explaining failures.
 */

/**
 * What the reader typed, as an address to look up. A missing scheme means
 * https://, so "theverge.com" works.
 *
 * @param {string} input
 * @returns {{ url: string, error?: undefined } | { error: string, url?: undefined }}
 */
export function toFeedAddress(input) {
  const text = input.trim();
  if (!text) return { error: 'Paste the address of a website or a feed.' };

  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `https://${text}`);
  } catch {
    return { error: 'That doesn’t look like a web address.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'Use a web address, starting with http:// or https://.' };
  }
  if (url.username || url.password) {
    return { error: 'Addresses with a username or password aren’t supported.' };
  }
  if (!url.hostname.includes('.') && !url.hostname.startsWith('[')) {
    return { error: 'That doesn’t look like a web address.' };
  }
  return { url: url.href };
}

/** A feed counts as quiet when its newest story is this old. */
const QUIET_AFTER_DAYS = 90;

/**
 * How often a feed publishes, for its preview: "About 70 posts a day",
 * "About 4 posts a week", or, for a feed that has gone quiet, the date of its
 * newest story.
 *
 * @param {number|null} postsPerWeek  From the feed endpoint
 * @param {string|null} newest  The newest story's date
 * @param {number} now
 * @param {(iso: string) => string} formatDate
 */
export function postingLabel(postsPerWeek, newest, now, formatDate) {
  if (newest && now - Date.parse(newest) > QUIET_AFTER_DAYS * 86_400_000) {
    return `No new stories since ${formatDate(newest)}`;
  }
  if (postsPerWeek === null) return null;
  if (postsPerWeek >= 14) return `About ${Math.round(postsPerWeek / 7)} posts a day`;
  if (postsPerWeek >= 1) {
    return `About ${postsPerWeek} ${postsPerWeek === 1 ? 'post' : 'posts'} a week`;
  }
  return 'Less than one post a week';
}

/**
 * Why a link couldn't be previewed: a headline and what to try.
 *
 * @param {unknown} error  From the getFeed query
 * @returns {{ title: string, detail: string }}
 */
export function addFeedProblem(error) {
  const failure =
    /** @type {{ status?: unknown, data?: { error?: { code?: string, message?: string } } }} */ (
      error
    );
  const details = failure?.data?.error;
  const message = details?.message ?? '';
  switch (details?.code) {
    case 'NO_FEED_FOUND':
      return {
        title: 'We couldn’t find a feed at that address.',
        detail: 'Try the site’s homepage, or a link that ends in /feed or /rss.',
      };
    case 'NOT_A_FEED':
      return { title: 'That address isn’t a feed.', detail: message };
    case 'INVALID_URL':
      return { title: 'That doesn’t look like a web address.', detail: message };
    case 'BLOCKED_HOST':
      return { title: 'Feedolio can’t read feeds from that address.', detail: message };
    case 'UPSTREAM_TIMEOUT':
      return { title: 'The site didn’t answer in time.', detail: 'Try again in a moment.' };
    case 'TOO_LARGE':
      return { title: 'That feed is too large.', detail: message };
    case 'UPSTREAM_ERROR':
      return { title: 'The site couldn’t be read.', detail: message };
    default:
      return failure?.status === 'FETCH_ERROR'
        ? { title: 'Feedolio couldn’t check that link.', detail: 'You might be offline.' }
        : { title: 'Something went wrong.', detail: 'Try again in a moment.' };
  }
}
