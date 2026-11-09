import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { selectCutoff } from '../../app/visitsSlice.js';
import { Link, useParams } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import StoryList, { EmptyState, FeedErrors, ListNote } from '../../components/StoryList.jsx';
import { displayUrl } from '../../lib/feeds.js';
import { shortDate } from '../../lib/time.js';
import { useNow } from '../../lib/useNow.js';
import { HiddenNote } from '../ai/rules/RuleNotes.jsx';
import { useWithoutHidden } from '../ai/rules/useRules.js';
import { selectSubscriptionById } from '../subscriptions/subscriptionsSlice.js';
import { useGetFeedQuery } from './feedApi.js';
import ListHeader from './ListHeader.jsx';
import { dividerPlace, mergeStories, useFeedStates, useRetryFeed } from './useFeeds.js';

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
  const cutoff = useSelector(selectCutoff);
  const { stories, hidden } = useWithoutHidden(mergeStories([state]));
  const loading = state.status === 'loading';
  const { newCount, firstOldId } = dividerPlace(stories, cutoff);
  const newest = stories[0]?.story.publishedAt;
  const quiet = newest && now - Date.parse(newest) > QUIET_AFTER_DAYS * 86_400_000;

  return (
    <>
      <ListHeader
        title={subscription.title}
        summary={displayUrl(subscription.url)}
        states={[state]}
        newCount={loading ? 0 : newCount}
        showJump={!loading && firstOldId !== null}
      />
      {quiet && (
        <ListNote>No new stories since {shortDate(newest)}. Older stories stay readable.</ListNote>
      )}
      <FeedErrors failed={state.status === 'error' ? [state] : []} onRetry={retry} />
      <HiddenNote hidden={hidden} />
      {state.status === 'ready' && stories.length === 0 ? (
        <EmptyState title="No stories yet">This feed hasn’t published anything.</EmptyState>
      ) : (
        state.status !== 'error' && (
          <StoryList
            stories={stories}
            now={now}
            loading={loading}
            label={subscription.title}
            cutoff={loading ? null : cutoff}
          />
        )
      )}
    </>
  );
}
