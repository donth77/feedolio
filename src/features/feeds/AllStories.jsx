import { useSelector } from 'react-redux';
import PageHeader from '../../components/PageHeader.jsx';
import StoryList, { EmptyState, FeedErrors } from '../../components/StoryList.jsx';
import { useNow } from '../../lib/useNow.js';
import { selectEnabledSubscriptions } from '../subscriptions/subscriptionsSlice.js';
import { mergeStories, useFeedStates, useRetryFeed } from './useFeeds.js';

/** Every enabled feed merged, newest first, under date headers. */
export default function AllStories() {
  const subscriptions = useSelector(selectEnabledSubscriptions);
  const states = useFeedStates(subscriptions);
  const retry = useRetryFeed();
  const now = useNow();
  const stories = mergeStories(states);
  const loading = states.some((state) => state.status === 'loading');
  const failed = states.filter((state) => state.status === 'error');

  return (
    <>
      <PageHeader
        title="All stories"
        description={
          loading
            ? `Loading ${subscriptions.length} feeds…`
            : `${stories.length} stories from ${subscriptions.length - failed.length} feeds`
        }
      />
      <FeedErrors failed={failed} onRetry={retry} />
      {!loading && stories.length === 0 && failed.length === 0 ? (
        <EmptyState title="No stories yet">Your feeds haven’t published anything.</EmptyState>
      ) : (
        <StoryList stories={stories} now={now} loading={loading} showCounts />
      )}
    </>
  );
}
