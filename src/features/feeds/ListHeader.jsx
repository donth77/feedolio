import Icon from '../../components/Icon.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { updatedLabel } from '../../lib/time.js';
import { useNow } from '../../lib/useNow.js';
import styles from './ListHeader.module.css';
import { DIVIDER_ID, useRetryFeed } from './useFeeds.js';

/**
 * A story list's title, with what's in it, how much is new, how fresh it is,
 * and a Refresh button.
 *
 * @param {{
 *   title: string,
 *   summary: string,
 *   states: import('./useFeeds.js').FeedState[],
 *   newCount?: number,
 *   showJump?: boolean,
 * }} props
 *   newCount: stories since the last visit; showJump: the divider is on the page
 */
export default function ListHeader({ title, summary, states, newCount = 0, showJump = false }) {
  const now = useNow();
  const retry = useRetryFeed();
  const loaded = states.some((state) => state.data);
  const refreshing = states.some((state) => state.isFetching);
  // The stalest feed says how up to date the list is.
  const fetchedAt = states
    .map((state) => state.data?.fetchedAt)
    .filter((time) => typeof time === 'string')
    .sort()[0];

  const parts = [
    <span key="summary">{summary}</span>,
    newCount > 0 && <span key="new">{newCount} new since your last visit</span>,
    fetchedAt && !refreshing && <span key="updated">Updated {updatedLabel(fetchedAt, now)}</span>,
    showJump && (
      <a key="jump" href={`#${DIVIDER_ID}`} className={styles.jump} onClick={jumpToDivider}>
        Jump to where you left off
      </a>
    ),
  ].filter(Boolean);

  return (
    <PageHeader
      title={title}
      description={parts.flatMap((part, index) =>
        index === 0
          ? [part]
          : [
              <span key={`dot-${index}`} aria-hidden="true">
                {' · '}
              </span>,
              part,
            ],
      )}
      actions={
        states.length > 0 && (
          <button
            type="button"
            className={styles.refresh}
            disabled={refreshing}
            onClick={() => states.forEach((state) => retry(state.feed.url))}
          >
            <Icon name="refresh" size={18} />
            {refreshing && loaded ? 'Refreshing…' : 'Refresh'}
          </button>
        )
      }
    />
  );
}

/**
 * Scrolls to the divider and puts focus on the first story the reader saw
 * last time.
 *
 * @param {import('react').MouseEvent<HTMLAnchorElement>} event
 */
function jumpToDivider(event) {
  const divider = document.getElementById(DIVIDER_ID);
  if (!divider) return;
  event.preventDefault();
  divider.scrollIntoView?.({ block: 'center' });
  divider.nextElementSibling?.querySelector('a')?.focus({ preventScroll: true });
}
