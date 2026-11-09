import { skipToken } from '@reduxjs/toolkit/query';
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { selectBookmarkById } from '../bookmarks/bookmarksSlice.js';
import { useGetFeedQuery } from '../feeds/feedApi.js';
import { lookOf, mergeStories } from '../feeds/useFeeds.js';
import { selectSubscriptionById } from '../subscriptions/subscriptionsSlice.js';

/** @typedef {import('../../lib/types.js').Story} Story */
/** @typedef {import('../subscriptions/subscriptionsSlice.js').Subscription} Subscription */

/**
 * What the story page knows about its story.
 *
 * @typedef {Object} StoryLookup
 * @property {'loading'|'ready'|'error'|'unavailable'} status
 * @property {Story|null} story
 * @property {string|null} feedTitle
 * @property {Subscription|undefined} subscription  Missing when the reader no longer follows the feed
 * @property {Story|null} newer  The next newer story in the same feed
 * @property {Story|null} older
 * @property {string|null} siteUrl  The feed's website, once it has loaded
 * @property {unknown} error
 * @property {boolean} isFetching
 * @property {() => void} retry
 */

/**
 * Finds the story for /feeds/:feedId/stories/:storyId, in this order:
 * 1. the feed's data, if it's already loaded;
 * 2. the feed, fetched now (after a reload or from a shared link);
 * 3. the reader's saved copy, so bookmarks open after a story leaves its feed
 *    or the feed is removed;
 * 4. otherwise the story is unavailable.
 *
 * A saved copy shows at once while the feed loads; the feed's copy replaces it
 * when it arrives.
 *
 * @param {string} feedId
 * @param {string} storyId
 * @returns {StoryLookup}
 */
export function useStory(feedId, storyId) {
  const subscription = useSelector((state) => selectSubscriptionById(state, feedId));
  const bookmark = useSelector((state) => selectBookmarkById(state, storyId));
  const feed = useGetFeedQuery(subscription?.url ?? skipToken);

  const ordered = useMemo(
    () => (subscription && feed.data ? feedOrder(subscription, feed.data) : []),
    [subscription, feed.data],
  );
  const index = ordered.findIndex((story) => story.id === storyId);
  const story = ordered[index] ?? bookmark?.story ?? null;
  const waiting = Boolean(subscription) && (feed.isLoading || feed.isFetching);

  /** @type {StoryLookup['status']} */
  let status = 'unavailable';
  if (story) status = 'ready';
  else if (waiting) status = 'loading';
  else if (feed.isError) status = 'error';

  return {
    status,
    story,
    feedTitle: subscription?.title ?? bookmark?.feedTitle ?? null,
    subscription,
    newer: index > 0 ? ordered[index - 1] : null,
    older: index >= 0 ? (ordered[index + 1] ?? null) : null,
    siteUrl: feed.data?.feed.siteUrl ?? null,
    error: feed.error,
    isFetching: feed.isFetching,
    retry: () => {
      if (subscription) feed.refetch();
    },
  };
}

/**
 * The feed's stories in list order: newest first, undated last.
 *
 * @param {Subscription} subscription
 * @param {import('../../lib/types.js').FeedResponse} data
 */
function feedOrder(subscription, data) {
  const state = /** @type {import('../feeds/useFeeds.js').FeedState} */ ({
    feed: lookOf(subscription),
    status: 'ready',
    data,
    error: undefined,
    isFetching: false,
  });
  return mergeStories([state]).map(({ story }) => story);
}
