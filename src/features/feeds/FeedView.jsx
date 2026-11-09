import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Link, useParams } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import StoryList, { EmptyState, FeedErrors, ListNote } from '../../components/StoryList.jsx';
import { displayUrl } from '../../lib/feeds.js';
import { shortDate } from '../../lib/time.js';
import { useNow } from '../../lib/useNow.js';
import { selectSubscriptionById } from '../subscriptions/subscriptionsSlice.js';
import { useGetFeedQuery } from './feedApi.js';
import { mergeStories, useFeedStates, useRetryFeed } from './useFeeds.js';

/** A feed counts as quiet when its newest story is this old. */
const QUIET_AFTER_DAYS = 90;

/** One feed's stories, at /feeds/:feedId. */
export default function FeedView() {
  const { feedId = '' } = useParams();
  const subscription = useSelector((state) => selectSubscriptionById(state, feedId));

  if (!subscription) {
    return (
      <>
        <PageHeader title="Feed not found" description="You don’t follow a feed at this address." />
        <p>
          <Link to="/">Go to All stories</Link>
        </p>
      </>
    );
  }
  return <FeedStories subscription={subscription} />;
}

/**
 * @param {{ subscription: import('../subscriptions/subscriptionsSlice.js').Subscription }} props
 */
function FeedStories({ subscription }) {
  // Keeps this feed loaded even if it's hidden from All stories.
  useGetFeedQuery(subscription.url);
  const subscriptions = useMemo(() => [subscription], [subscription]);
  const [state] = useFeedStates(subscriptions);
  const retry = useRetryFeed();
  const now = useNow();
  const stories = mergeStories([state]);
  const newest = stories[0]?.story.publishedAt;
  const quiet = newest && now - Date.parse(newest) > QUIET_AFTER_DAYS * 86_400_000;

  return (
    <>
      <PageHeader title={subscription.title} description={displayUrl(subscription.url)} />
      {quiet && (
        <ListNote>No new stories since {shortDate(newest)}. Older stories stay readable.</ListNote>
      )}
      <FeedErrors failed={state.status === 'error' ? [state] : []} onRetry={retry} />
      {state.status === 'ready' && stories.length === 0 ? (
        <EmptyState title="No stories yet">This feed hasn’t published anything.</EmptyState>
      ) : (
        state.status !== 'error' && (
          <StoryList
            stories={stories}
            now={now}
            loading={state.status === 'loading'}
            label={subscription.title}
          />
        )
      )}
    </>
  );
}
