import { useSelector } from 'react-redux';
import { selectCutoff, selectShowWelcome } from '../../app/visitsSlice.js';
import StoryList, { EmptyState, FeedErrors } from '../../components/StoryList.jsx';
import { useNow } from '../../lib/useNow.js';
import { HiddenNote, RulesStatus } from '../ai/rules/RuleNotes.jsx';
import { useWithoutHidden } from '../ai/rules/useRules.js';
import { selectEnabledSubscriptions } from '../subscriptions/subscriptionsSlice.js';
import ListHeader from './ListHeader.jsx';
import { dividerPlace, mergeStories, useFeedStates, useRetryFeed } from './useFeeds.js';
import WelcomeNote from './WelcomeNote.jsx';

/**
 * Every enabled feed merged, newest first, under date headers. A first visit
 * opens with a welcome note; later visits mark what's new since last time.
 */
export default function AllStories() {
  const subscriptions = useSelector(selectEnabledSubscriptions);
  const states = useFeedStates(subscriptions);
  const retry = useRetryFeed();
  const now = useNow();
  const cutoff = useSelector(selectCutoff);
  const showWelcome = useSelector(selectShowWelcome);
  const { stories, hidden } = useWithoutHidden(mergeStories(states));
  const loading = states.some((state) => state.status === 'loading');
  const failed = states.filter((state) => state.status === 'error');
  const { newCount, firstOldId } = dividerPlace(stories, cutoff);
  const feedCount = subscriptions.length - failed.length;

  return (
    <>
      <ListHeader
        title="All stories"
        summary={
          loading
            ? `Loading ${subscriptions.length} feeds…`
            : `${stories.length} stories from ${feedCount} ${feedCount === 1 ? 'feed' : 'feeds'}`
        }
        states={states}
        newCount={loading ? 0 : newCount}
        showJump={!loading && firstOldId !== null}
      />
      {showWelcome && <WelcomeNote />}
      <FeedErrors failed={failed} onRetry={retry} />
      <HiddenNote hidden={hidden} />
      {subscriptions.length === 0 ? (
        <EmptyState title="No feeds to show" action={{ to: '/settings', label: 'Open Settings' }}>
          Every feed is hidden from All stories, or you don’t follow any yet.
        </EmptyState>
      ) : !loading && stories.length === 0 && failed.length === 0 ? (
        <EmptyState title="No stories yet">Your feeds haven’t published anything.</EmptyState>
      ) : (
        <StoryList
          stories={stories}
          now={now}
          loading={loading}
          label="All stories"
          cutoff={loading ? null : cutoff}
          showCounts
        />
      )}
      {!loading && <RulesStatus now={now} />}
    </>
  );
}
