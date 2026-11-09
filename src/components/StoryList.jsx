import { useId, useMemo } from 'react';
import { useLocation } from 'react-router';
import { feedErrorMessage } from '../features/feeds/feedApi.js';
import { GROUP_LABELS, groupByDate, groupDates } from '../lib/time.js';
import Icon from './Icon.jsx';
import styles from './StoryList.module.css';
import StoryRow, { SkeletonRow } from './StoryRow.jsx';

/** @typedef {import('../features/feeds/useFeeds.js').ListedStory} ListedStory */
/** @typedef {import('../features/feeds/useFeeds.js').FeedState} FeedState */

/**
 * Stories under date headers (Today, Yesterday, Earlier this week, Older),
 * with a grey placeholder while nothing has loaded yet.
 *
 * @param {{
 *   stories: ListedStory[],
 *   now: number,
 *   loading: boolean,
 *   label: string,
 *   showCounts?: boolean,
 * }} props
 *   label: the list's name, for the story page's back link ("All stories")
 */
export default function StoryList({ stories, now, loading, label, showCounts = false }) {
  const idPrefix = useId();
  const { pathname } = useLocation();
  const from = useMemo(() => ({ pathname, label }), [pathname, label]);

  if (stories.length === 0 && loading) {
    return (
      <ul className={styles.list} aria-busy="true" aria-label="Loading stories">
        {[0, 1, 2, 3].map((n) => (
          <SkeletonRow key={n} />
        ))}
      </ul>
    );
  }

  return (
    <div aria-busy={loading}>
      {groupByDate(stories, now).map(({ group, items }) => {
        const headingId = `${idPrefix}-${group}`;
        const count = `${items.length} ${items.length === 1 ? 'story' : 'stories'}`;
        return (
          <section key={group} aria-labelledby={headingId}>
            <div className={styles.dateHeader}>
              <h2 id={headingId} className={styles.dateTitle}>
                {GROUP_LABELS[group]}
              </h2>
              <span className={styles.dateSub}>
                {groupDates(group, now)}
                {showCounts && ` · ${count}`}
              </span>
            </div>
            <ul className={styles.list}>
              {items.map((item) => (
                <StoryRow key={item.story.id} item={item} now={now} from={from} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * "Couldn't load {feed}" with the reason and a Retry button, one per failed
 * feed. The rest of the list still shows.
 *
 * @param {{ failed: FeedState[], onRetry: (url: string) => void }} props
 */
export function FeedErrors({ failed, onRetry }) {
  return failed.map(({ feed, error, isFetching }) => (
    <div key={feed.id} className={styles.error} role="alert">
      <Icon name="alert" className={styles.errorIcon} />
      <p className={styles.errorText}>
        <strong>Couldn’t load {feed.title}.</strong> {feedErrorMessage(error)}
      </p>
      <button
        type="button"
        className={styles.retry}
        onClick={() => onRetry(feed.url)}
        disabled={isFetching}
      >
        {isFetching ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  ));
}

/**
 * A calm box for when a list has nothing to show.
 *
 * @param {{ title: string, children?: import('react').ReactNode }} props
 */
export function EmptyState({ title, children }) {
  return (
    <div className={styles.empty}>
      <h2 className={styles.emptyTitle}>{title}</h2>
      {children && <div className={styles.emptyText}>{children}</div>}
    </div>
  );
}

/**
 * A note above a list, e.g. that a feed stopped publishing.
 *
 * @param {{ children: import('react').ReactNode }} props
 */
export function ListNote({ children }) {
  return (
    <p className={styles.note} role="note">
      <Icon name="info" className={styles.noteIcon} />
      <span>{children}</span>
    </p>
  );
}
