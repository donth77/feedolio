import { createApi, fetchBaseQuery, retry } from '@reduxjs/toolkit/query/react';

/** Waits before the first and second retries. */
const RETRY_DELAYS = [1_000, 3_000];

/**
 * Worth trying again: the network failed, the publisher timed out, or it
 * answered with a server error. A missing page, a blocked address or a
 * non-feed won't fix itself, so those fail at once.
 *
 * @param {import('@reduxjs/toolkit/query').FetchBaseQueryError} error
 */
export function isRetryable(error) {
  if (error.status === 'FETCH_ERROR' || error.status === 'TIMEOUT_ERROR') return true;
  if (error.status === 'PARSING_ERROR') return error.originalStatus >= 500;
  const details = /** @type {{ error?: { code?: string, upstreamStatus?: number } }} */ (error.data)
    ?.error;
  if (details?.code === 'UPSTREAM_TIMEOUT') return true;
  if (details?.code === 'UPSTREAM_ERROR') return !(details.upstreamStatus < 500);
  return typeof error.status === 'number' && error.status >= 500 && !details?.code;
}

// fetchBaseQuery builds a Request, which needs an absolute address outside browsers.
const API_BASE = new URL('/api/', globalThis.location?.href ?? 'http://localhost/').href;

/**
 * Feed data from the Worker. Results are cached per feed address and kept for
 * ten minutes after the last view.
 */
export const feedApi = createApi({
  reducerPath: 'feedApi',
  baseQuery: retry(fetchBaseQuery({ baseUrl: API_BASE }), {
    retryCondition: (error, _args, { attempt }) =>
      attempt <= RETRY_DELAYS.length &&
      isRetryable(/** @type {import('@reduxjs/toolkit/query').FetchBaseQueryError} */ (error)),
    backoff: (attempt) =>
      new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAYS[attempt - 1] ?? RETRY_DELAYS.at(-1)),
      ),
  }),
  keepUnusedDataFor: 600,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    getFeed: build.query({
      /** @param {string} url */
      query: (url) => ({ url: 'feed', params: { url } }),
      /** @returns {import('../../lib/types.js').FeedResponse} */
      transformResponse: (/** @type {any} */ response) => response,
    }),
  }),
});

export const { useGetFeedQuery } = feedApi;

/**
 * A plain-English reason for a failed feed.
 *
 * @param {unknown} error  From a getFeed result
 */
export function feedErrorMessage(error) {
  const failure = /** @type {{ status?: unknown, data?: { error?: { message?: string } } }} */ (
    error
  );
  if (failure?.data?.error?.message) return failure.data.error.message;
  if (failure?.status === 'FETCH_ERROR') return 'You might be offline.';
  return 'Something went wrong. Try again in a moment.';
}
