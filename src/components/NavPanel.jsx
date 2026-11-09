import { Link, NavLink } from 'react-router';
import Icon from './Icon.jsx';
import { FeedDot } from './Monogram.jsx';
import styles from './NavPanel.module.css';

/**
 * The wordmark with its "F" tile, linking home.
 *
 * @param {{ onNavigate?: () => void, className?: string }} props
 */
export function Wordmark({ onNavigate, className = '' }) {
  return (
    <Link to="/" className={`${styles.wordmark} ${className}`} onClick={onNavigate}>
      <span className={styles.logo} aria-hidden="true">
        F
      </span>
      Feedolio
    </Link>
  );
}

/**
 * Sections and feeds: the desktop sidebar, and the tablet drawer.
 *
 * @param {{
 *   id?: string,
 *   label: string,
 *   feeds: import('../features/feeds/useFeeds.js').FeedLook[],
 *   todayCount: number|null,
 *   onNavigate?: () => void,
 *   className?: string,
 * }} props
 */
export default function NavPanel({ id, label, feeds, todayCount, onNavigate, className = '' }) {
  return (
    <nav id={id} aria-label={label} className={`${styles.panel} ${className}`}>
      <Wordmark onNavigate={onNavigate} className={styles.panelWordmark} />

      <ul className={styles.items}>
        <li>
          <NavLink to="/today" className={styles.item} onClick={onNavigate}>
            <Icon name="today" />
            <span className={styles.label}>Today</span>
            {todayCount !== null && (
              <>
                <span className={styles.count} aria-hidden="true">
                  {todayCount}
                </span>
                <span className="visually-hidden">
                  , {todayCount} {todayCount === 1 ? 'story' : 'stories'}
                </span>
              </>
            )}
          </NavLink>
        </li>
        <li>
          <NavLink to="/" end className={styles.item} onClick={onNavigate}>
            <Icon name="stories" />
            <span className={styles.label}>All stories</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/bookmarks" className={styles.item} onClick={onNavigate}>
            <Icon name="saved" />
            <span className={styles.label}>Saved</span>
          </NavLink>
        </li>
      </ul>

      <div className={styles.feeds}>
        <h2 className={styles.heading}>Feeds</h2>
        <ul className={styles.items}>
          {feeds.map((feed) => (
            <li key={feed.id}>
              <NavLink to={`/feeds/${feed.id}`} className={styles.item} onClick={onNavigate}>
                <FeedDot feed={feed} />
                <span className={styles.label}>{feed.title}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.footer}>
        <NavLink to="/settings" className={styles.item} onClick={onNavigate}>
          <Icon name="settings" />
          <span className={styles.label}>Settings</span>
        </NavLink>
      </div>
    </nav>
  );
}
