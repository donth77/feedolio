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
 * @typedef {Object} NavPanelProps
 * @property {string} [id]
 * @property {string} label
 * @property {import('../features/feeds/useFeeds.js').FeedLook[]} feeds
 * @property {number|null} todayCount
 * @property {number} savedCount
 * @property {() => void} onAddFeed
 * @property {() => void} [onNavigate]
 * @property {boolean} [collapsed]  Show the slim icon rail instead
 * @property {() => void} [onToggle]  Shows the collapse or expand button
 * @property {string} [className]
 */

/**
 * Sections and feeds: the desktop sidebar (which can collapse to a 64 px icon
 * rail), and the tablet drawer.
 *
 * @param {NavPanelProps} props
 */
export default function NavPanel(props) {
  return props.collapsed ? <Rail {...props} /> : <Panel {...props} />;
}

/** @param {NavPanelProps} props */
function Panel({
  id,
  label,
  feeds,
  todayCount,
  savedCount,
  onAddFeed,
  onNavigate,
  onToggle,
  className = '',
}) {
  return (
    <nav id={id} aria-label={label} className={`${styles.panel} ${className}`}>
      <div className={styles.top}>
        <Wordmark onNavigate={onNavigate} className={styles.panelWordmark} />
        {onToggle && <SidebarToggle id={id} expanded onToggle={onToggle} />}
      </div>

      <button type="button" className={styles.addFeed} onClick={onAddFeed}>
        <Icon name="add" />
        Add feed
      </button>

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
                <span className="visually-hidden">, {storiesLabel(todayCount)}</span>
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
            <span className={styles.count} aria-hidden="true">
              {savedCount}
            </span>
            <span className="visually-hidden">, {savedCount} saved</span>
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

/**
 * The collapsed sidebar: icons only, each with an accessible name and a
 * tooltip, and badges for the counts.
 *
 * @param {NavPanelProps} props
 */
function Rail({ id, label, feeds, todayCount, savedCount, onAddFeed, onToggle, className = '' }) {
  return (
    <nav id={id} aria-label={label} className={`${styles.rail} ${className}`}>
      <div className={styles.railTop}>
        <Link to="/" className={styles.railItem} aria-label="Feedolio" title="Feedolio">
          <span className={styles.logo} aria-hidden="true">
            F
          </span>
        </Link>
        {onToggle && <SidebarToggle id={id} expanded={false} onToggle={onToggle} />}
      </div>

      <button
        type="button"
        className={styles.railAdd}
        aria-label="Add feed"
        title="Add feed"
        onClick={onAddFeed}
      >
        <Icon name="add" />
      </button>

      <ul className={styles.railItems}>
        <li>
          <NavLink
            to="/today"
            className={styles.railItem}
            aria-label={todayCount === null ? 'Today' : `Today, ${storiesLabel(todayCount)}`}
            title="Today"
          >
            <Icon name="today" />
            {todayCount !== null && (
              <span className={styles.badge} aria-hidden="true">
                {todayCount}
              </span>
            )}
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/"
            end
            className={styles.railItem}
            aria-label="All stories"
            title="All stories"
          >
            <Icon name="stories" />
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/bookmarks"
            className={styles.railItem}
            aria-label={`Saved, ${savedCount} saved`}
            title="Saved"
          >
            <Icon name="saved" />
            <span className={styles.badge} aria-hidden="true">
              {savedCount}
            </span>
          </NavLink>
        </li>
      </ul>

      <div className={styles.railRule} aria-hidden="true" />

      <ul className={styles.railItems} aria-label="Feeds">
        {feeds.map((feed) => (
          <li key={feed.id}>
            <NavLink
              to={`/feeds/${feed.id}`}
              className={styles.railItem}
              aria-label={feed.title}
              title={feed.title}
            >
              <FeedDot feed={feed} />
            </NavLink>
          </li>
        ))}
      </ul>

      <div className={styles.railFooter}>
        <NavLink to="/settings" className={styles.railItem} aria-label="Settings" title="Settings">
          <Icon name="settings" />
        </NavLink>
      </div>
    </nav>
  );
}

/**
 * Collapses the sidebar to the rail, or expands it again. Also on the `[` key.
 *
 * @param {{ id?: string, expanded: boolean, onToggle: () => void }} props
 */
function SidebarToggle({ id, expanded, onToggle }) {
  const label = expanded ? 'Collapse sidebar' : 'Expand sidebar';
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={id}
      aria-keyshortcuts="["
      data-shortcut="sidebar"
      title={`${label} ([)`}
      onClick={onToggle}
    >
      <Icon name="sidebar" />
    </button>
  );
}

/** @param {number} count */
function storiesLabel(count) {
  return `${count} ${count === 1 ? 'story' : 'stories'}`;
}
