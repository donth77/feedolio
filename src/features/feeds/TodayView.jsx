import { useSelector } from 'react-redux';
import { selectCutoff } from '../../app/visitsSlice.js';
import StoryList, { EmptyState, FeedErrors } from '../../components/StoryList.jsx';
import { useNow } from '../../lib/useNow.js';
import { HiddenNote } from '../ai/rules/RuleNotes.jsx';
import { useWithoutHidden } from '../ai/rules/useRules.js';
import { selectEnabledSubscriptions } from '../subscriptions/subscriptionsSlice.js';
import ListHeader from './ListHeader.jsx';
import { dividerPlace, inLastDay, mergeStories, useFeedStates, useRetryFeed } from './useFeeds.js';

/** Stories from the last 24 hours across enabled feeds. */
export default function TodayView() {
  const subscriptions = useSelector(selectEnabledSubscriptions);
  const states = useFeedStates(subscriptions);
  const retry = useRetryFeed();
  const now = useNow();
  const cutoff = useSelector(selectCutoff);
  const { stories, hidden } = useWithoutHidden(inLastDay(mergeStories(states), now));
  const loading = states.some((state) => state.status === 'loading');
  const failed = states.filter((state) => state.status === 'error');
  const count = `${stories.length} ${stories.length === 1 ? 'story' : 'stories'}`;
  const { newCount, firstOldId } = dividerPlace(stories, cutoff);

  return (
    <>
      <ListHeader
        title="Today"
        summary={loading ? 'Loading the last 24 hours…' : `${count} in the last 24 hours`}
        states={states}
        newCount={loading ? 0 : newCount}
        showJump={!loading && firstOldId !== null}
      />
      <FeedErrors failed={failed} onRetry={retry} />
      <HiddenNote hidden={hidden} />
      {!loading && stories.length === 0 ? (
        <EmptyState title="Nothing in the last 24 hours">
          New stories from your feeds will show up here.
        </EmptyState>
      ) : (
        <StoryList
          stories={stories}
          now={now}
          loading={loading}
          label="Today"
          cutoff={loading ? null : cutoff}
          showCounts
        />
      )}
    </>
  );
}
