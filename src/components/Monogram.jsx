import styles from './Monogram.module.css';

/**
 * @typedef {{ monogram: string, tint: import('../lib/feeds.js').Tint }} FeedMark
 */

/**
 * The feed's initials on its tint, filling its box. Decorative: the feed's
 * name is always written next to it.
 *
 * @param {{ feed: FeedMark, className?: string }} props
 */
export function MonogramTile({ feed, className = '' }) {
  return (
    <div className={`${styles.tile} ${styles[feed.tint]} ${className}`} aria-hidden="true">
      {feed.monogram}
    </div>
  );
}

/**
 * A small tinted square with the feed's initials, beside its name.
 *
 * @param {{ feed: FeedMark, className?: string }} props
 */
export function FeedDot({ feed, className = '' }) {
  return (
    <span className={`${styles.dot} ${styles[feed.tint]} ${className}`} aria-hidden="true">
      {feed.monogram}
    </span>
  );
}
