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
 * As an icon (in the sidebar rail, where the link is named after the feed),
 * the initials are drawn by CSS rather than written as text, so a link named
 * "TechCrunch Startups" doesn't also show the text "TS".
 *
 * @param {{ feed: FeedMark, className?: string, icon?: boolean }} props
 */
export function FeedDot({ feed, className = '', icon = false }) {
  const classes = `${styles.dot} ${styles[feed.tint]} ${className}`;
  if (icon) {
    return (
      <span
        className={`${classes} ${styles.drawn}`}
        data-initials={feed.monogram}
        aria-hidden="true"
      />
    );
  }
  return (
    <span className={classes} aria-hidden="true">
      {feed.monogram}
    </span>
  );
}
