import { useSelector } from 'react-redux';
import PageHeader from '../../components/PageHeader.jsx';
import StoryList, { EmptyState, FeedErrors } from '../../components/StoryList.jsx';
import { useNow } from '../../lib/useNow.js';
import { selectEnabledSubscriptions } from '../subscriptions/subscriptionsSlice.js';
import { inLastDay, mergeStories, useFeedStates, useRetryFeed } from './useFeeds.js';

/** Stories from the last 24 hours across enabled feeds. */
export default function TodayView() {
  const subscriptions = useSelector(selectEnabledSubscriptions);
  const states = useFeedStates(subscriptions);
  const retry = useRetryFeed();
  const now = useNow();
  const stories = inLastDay(mergeStories(states), now);
  const loading = states.some((state) => state.status === 'loading');
  const failed = states.filter((state) => state.status === 'error');
  const count = `${stories.length} ${stories.length === 1 ? 'story' : 'stories'}`;

  return (
    <>
      <PageHeader
        title="Today"
        description={loading ? 'Loading the last 24 hours…' : `${count} in the last 24 hours`}
      />
      <FeedErrors failed={failed} onRetry={retry} />
      {!loading && stories.length === 0 ? (
        <EmptyState title="Nothing in the last 24 hours">
          New stories from your feeds will show up here.
        </EmptyState>
      ) : (
        <StoryList stories={stories} now={now} loading={loading} showCounts />
      )}
    </>
  );
}
