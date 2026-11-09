import { createSelector } from '@reduxjs/toolkit';
import { useCallback, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { monogramFor, tintFor } from '../../lib/feeds.js';
import { feedApi } from './feedApi.js';

/** @typedef {import('../subscriptions/subscriptionsSlice.js').Subscription} Subscription */
/** @typedef {import('../../lib/types.js').Story} Story */

/**
 * A feed as lists show it: the subscription plus its tile.
 *
 * @typedef {Subscription & { monogram: string, tint: import('../../lib/feeds.js').Tint }} FeedLook
 */

/**
 * One feed's loading state.
 *
 * @typedef {Object} FeedState
 * @property {FeedLook} feed
 * @property {'loading'|'error'|'ready'} status
 * @property {import('../../lib/types.js').FeedResponse|undefined} data
 * @property {unknown} error
 * @property {boolean} isFetching
 */

/** @typedef {{ story: Story, feed: FeedLook }} ListedStory */

/** @param {Subscription} subscription @returns {FeedLook} */
export function lookOf(subscription) {
  return {
    ...subscription,
    monogram: monogramFor(subscription.title),
    tint: tintFor(subscription.url),
  };
}

/**
 * Keeps these feeds loaded while mounted. The app shell uses it for every
 * enabled feed, so views read from the cache and switching is instant.
 *
 * @param {Subscription[]} subscriptions
 */
export function useLoadFeeds(subscriptions) {
  const dispatch = useDispatch();
  const urls = subscriptions.map((subscription) => subscription.url).join('\n');
  useEffect(() => {
    const queries = urls
      .split('\n')
      .filter(Boolean)
      .map((url) => dispatch(feedApi.endpoints.getFeed.initiate(url)));
    return () => queries.forEach((query) => query.unsubscribe());
  }, [dispatch, urls]);
}

/**
 * The loading state of each feed, in order.
 *
 * @param {Subscription[]} subscriptions
 * @returns {FeedState[]}
 */
export function useFeedStates(subscriptions) {
  const selectStates = useMemo(
    () =>
      createSelector(
        subscriptions.map((subscription) => feedApi.endpoints.getFeed.select(subscription.url)),
        (...results) =>
          results.map((result, index) => ({
            feed: lookOf(subscriptions[index]),
            status: result.data ? 'ready' : result.isError ? 'error' : 'loading',
            data: result.data,
            error: result.error,
            isFetching: result.status === 'pending',
          })),
      ),
    [subscriptions],
  );
  return /** @type {FeedState[]} */ (useSelector(selectStates));
}

/**
 * Fetches one feed again, now.
 */
export function useRetryFeed() {
  const dispatch = useDispatch();
  return useCallback(
    (/** @type {string} */ url) =>
      dispatch(feedApi.endpoints.getFeed.initiate(url, { subscribe: false, forceRefetch: true })),
    [dispatch],
  );
}

/**
 * Every loaded story, newest first, without duplicates. Undated stories go
 * last.
 *
 * @param {FeedState[]} states
 * @returns {ListedStory[]}
 */
export function mergeStories(states) {
  const seen = new Set();
  /** @type {ListedStory[]} */
  const merged = [];
  for (const { feed, data } of states) {
    for (const story of data?.stories ?? []) {
      if (seen.has(story.id)) continue;
      seen.add(story.id);
      merged.push({ story, feed });
    }
  }
  return merged.sort(newestFirst);
}

/** @param {ListedStory} a @param {ListedStory} b */
function newestFirst(a, b) {
  const timeA = a.story.publishedAt ? Date.parse(a.story.publishedAt) : null;
  const timeB = b.story.publishedAt ? Date.parse(b.story.publishedAt) : null;
  if (timeA === timeB) return 0;
  if (timeA === null) return 1;
  if (timeB === null) return -1;
  return timeB - timeA;
}

/** Stories in the last 24 hours. @param {ListedStory[]} stories @param {number} now */
export function inLastDay(stories, now) {
  const since = now - 86_400_000;
  return stories.filter(({ story }) => story.publishedAt && Date.parse(story.publishedAt) > since);
}
