import { useSelector } from 'react-redux';
import { monogramFor, tintFor, tintForId } from '../../../lib/feeds.js';
import { mergeStories, useFeedStates } from '../../feeds/useFeeds.js';
import { selectAllSubscriptions } from '../../subscriptions/subscriptionsSlice.js';

/**
 * Turns judged stories back into list items: the live story while it's still
 * in its feed, otherwise the copy kept with the judgment, so nothing a rule
 * acted on ever disappears.
 *
 * @typedef {import('./judgmentsSlice.js').Judgment} Judgment
 * @typedef {import('../../feeds/useFeeds.js').ListedStory} ListedStory
 */

/** @returns {(judgment: Judgment) => ListedStory} */
export function useListed() {
  const subscriptions = useSelector(selectAllSubscriptions);
  const live = new Map(
    mergeStories(useFeedStates(subscriptions)).map((item) => [item.story.id, item]),
  );
  const byFeed = new Map(subscriptions.map((subscription) => [subscription.id, subscription]));
  return (judgment) => {
    const found = live.get(judgment.storyId);
    if (found) return found;
    const snapshot = /** @type {NonNullable<Judgment['story']>} */ (judgment.story);
    const subscription = byFeed.get(snapshot.feedId);
    return {
      story: /** @type {import('../../../lib/types.js').Story} */ ({
        ...snapshot,
        contentHtml: '',
        hasFullContent: false,
        categories: [],
        imageSource: null,
      }),
      feed: /** @type {any} */ ({
        id: snapshot.feedId,
        title: snapshot.feedTitle,
        monogram: monogramFor(snapshot.feedTitle),
        tint: subscription ? tintFor(subscription.url) : tintForId(snapshot.feedId),
      }),
    };
  };
}
