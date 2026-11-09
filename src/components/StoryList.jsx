import { useId, useMemo } from 'react';
import { Link, useLocation } from 'react-router';
import { feedErrorMessage } from '../features/feeds/feedApi.js';
import { fullTime, GROUP_LABELS, groupByDate, groupDates, visitLabel } from '../lib/time.js';
import Icon from './Icon.jsx';
import styles from './StoryList.module.css';
import StoryRow, { SkeletonRow } from './StoryRow.jsx';
import { DIVIDER_ID, dividerPlace } from '../features/feeds/useFeeds.js';

/** @typedef {import('../features/feeds/useFeeds.js').ListedStory} ListedStory */
/** @typedef {import('../features/feeds/useFeeds.js').FeedState} FeedState */

/**
 * Stories under date headers (Today, Yesterday, Earlier this week, Older),
 * with a grey placeholder while nothing has loaded yet, and a "New since
 * your last visit" divider when the reader has been here before.
 *
 * @param {{
 *   stories: ListedStory[],
 *   now: number,
 *   loading: boolean,
 *   label: string,
 *   cutoff?: string|null,
 *   showCounts?: boolean,
 * }} props
 *   label: the list's name, for the story page's back link ("All stories")
 *   cutoff: when the reader's last visit ended
 */
export default function StoryList({
  stories,
  now,
  loading,
  label,
  cutoff = null,
  showCounts = false,
}) {
  const idPrefix = useId();
  const { pathname } = useLocation();
  const from = useMemo(() => ({ pathname, label }), [pathname, label]);
  const { firstOldId } = dividerPlace(stories, cutoff);
  const row = (/** @type {ListedStory} */ item) => (
    <StoryRow key={item.story.id} item={item} now={now} from={from} />
  );

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
        const split = items.findIndex((item) => item.story.id === firstOldId);
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
            {split === -1 ? (
              <ul className={styles.list}>{items.map(row)}</ul>
            ) : (
              <>
                {split > 0 && <ul className={styles.list}>{items.slice(0, split).map(row)}</ul>}
                <NewSinceDivider cutoff={/** @type {string} */ (cutoff)} now={now} />
                <ul className={styles.list}>{items.slice(split).map(row)}</ul>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * The line between stories published since the reader's last visit and the
 * ones before it.
 *
 * @param {{ cutoff: string, now: number }} props
 */
function NewSinceDivider({ cutoff, now }) {
  return (
    <div
      id={DIVIDER_ID}
      className={styles.divider}
      role="separator"
      aria-label={`New since your last visit, ${fullTime(cutoff)}. Newer stories are above.`}
    >
      New since your last visit · {visitLabel(cutoff, now)}
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
 * @param {{
 *   title: string,
 *   children?: import('react').ReactNode,
 *   icon?: import('react').ComponentProps<typeof Icon>['name'],
 *   action?: { to: string, label: string },
 *   actionRef?: import('react').Ref<HTMLAnchorElement>,
 * }} props
 *   action: a link onward, such as "Browse all stories"
 */
export function EmptyState({ title, children, icon, action, actionRef }) {
  return (
    <div className={styles.empty}>
      {icon && <Icon name={icon} size={32} className={styles.emptyIcon} />}
      <h2 className={styles.emptyTitle}>{title}</h2>
      {children && <div className={styles.emptyText}>{children}</div>}
      {action && (
        <Link ref={actionRef} to={action.to} className={styles.emptyAction}>
          {action.label}
        </Link>
      )}
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
