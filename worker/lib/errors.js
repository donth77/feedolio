/** HTTP status for each documented error code. */
const STATUS = {
  INVALID_URL: 400,
  BLOCKED_HOST: 400,
  NOT_A_FEED: 422,
  NO_FEED_FOUND: 422,
  UPSTREAM_ERROR: 502,
  TOO_LARGE: 502,
  UPSTREAM_TIMEOUT: 504,
};

/**
 * @typedef {keyof typeof STATUS} FeedErrorCode
 */

/**
 * An expected failure of GET /api/feed, sent to the app as
 * `{ error: { code, message, upstreamStatus? } }`.
 */
export class FeedError extends Error {
  /**
   * @param {FeedErrorCode} code
   * @param {string} message  Plain English; shown to readers
   * @param {{ upstreamStatus?: number }} [details]
   */
  constructor(code, message, { upstreamStatus } = {}) {
    super(message);
    this.name = 'FeedError';
    this.code = code;
    this.status = STATUS[code];
    this.upstreamStatus = upstreamStatus;
  }
}
