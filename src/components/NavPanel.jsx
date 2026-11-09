import { lazy, Suspense } from 'react';
import { Link, NavLink } from 'react-router';
import { tagPath } from '../features/ai/rules/useRules.js';
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
 * @property {AiNav} [ai]  Catch me up, Maybe, Hidden and tags, once the reader uses AI
 */

/** @typedef {ReturnType<typeof import('../features/ai/rules/useRules.js').useAiNav>} AiNav */

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
  ai,
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

      {ai?.show && (
        <div className={styles.group}>
          <h2 className={styles.heading}>AI</h2>
          <ul className={styles.items}>
            {ai.catchUp && (
              <li>
                <NavLink to="/catch-up" className={styles.item} onClick={onNavigate}>
                  <Icon name="sparkle" />
                  <span className={styles.label}>Catch me up</span>
                </NavLink>
              </li>
            )}
            {ai.ruleViews && (
              <>
                <li>
                  <NavLink to="/maybe" className={styles.item} onClick={onNavigate}>
                    <Icon name="maybe" />
                    <span className={styles.label}>Maybe</span>
                    <Count value={ai.maybe} spoken="to review" />
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/hidden" className={styles.item} onClick={onNavigate}>
                    <Icon name="hidden" />
                    <span className={styles.label}>Hidden</span>
                    <Count value={ai.hidden} spoken="hidden" />
                  </NavLink>
                </li>
              </>
            )}
          </ul>
        </div>
      )}

      {ai && ai.tags.length > 0 && (
        <div className={styles.group}>
          <h2 className={styles.heading}>Tags</h2>
          <ul className={styles.items}>
            {ai.tags.map(({ tag, count }) => (
              <li key={tag}>
                <NavLink to={tagPath(tag)} className={styles.item} onClick={onNavigate}>
                  <Icon name="tag" />
                  <span className={styles.label}>{tag}</span>
                  <Count value={count} spoken={count === 1 ? 'story' : 'stories'} />
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      )}

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
        <Account variant="sidebar" />
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
function Rail({
  id,
  label,
  feeds,
  todayCount,
  savedCount,
  onAddFeed,
  onToggle,
  className = '',
  ai,
}) {
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
        {ai?.catchUp && (
          <li>
            <NavLink
              to="/catch-up"
              className={styles.railItem}
              aria-label="Catch me up"
              title="Catch me up"
            >
              <Icon name="sparkle" />
            </NavLink>
          </li>
        )}
        {ai?.ruleViews && (
          <>
            <li>
              <NavLink
                to="/maybe"
                className={styles.railItem}
                aria-label={`Maybe, ${ai.maybe} to review`}
                title="Maybe"
              >
                <Icon name="maybe" />
                {ai.maybe > 0 && (
                  <span className={styles.badge} aria-hidden="true">
                    {ai.maybe}
                  </span>
                )}
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/hidden"
                className={styles.railItem}
                aria-label={`Hidden, ${ai.hidden} hidden`}
                title="Hidden"
              >
                <Icon name="hidden" />
                {ai.hidden > 0 && (
                  <span className={styles.badge} aria-hidden="true">
                    {ai.hidden}
                  </span>
                )}
              </NavLink>
            </li>
          </>
        )}
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
              <FeedDot feed={feed} icon />
            </NavLink>
          </li>
        ))}
      </ul>

      <div className={styles.railFooter}>
        <NavLink to="/settings" className={styles.railItem} aria-label="Settings" title="Settings">
          <Icon name="settings" />
        </NavLink>
        <Account variant="rail" />
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

// Loaded after the first page; it asks the Worker whether sign-in is offered.
const AccountPanel = lazy(() => import('../features/auth/AccountPanel.jsx'));

/**
 * Sign in, or who is signed in, when this copy of Feedolio has sign-in.
 *
 * @param {{ variant: 'sidebar'|'rail' }} props
 */
function Account({ variant }) {
  return (
    <Suspense fallback={null}>
      <AccountPanel variant={variant} />
    </Suspense>
  );
}

/**
 * A count beside a sidebar item, read out with its meaning.
 *
 * @param {{ value: number, spoken: string }} props
 */
function Count({ value, spoken }) {
  return (
    <>
      <span className={styles.count} aria-hidden="true">
        {value}
      </span>
      <span className="visually-hidden">
        , {value} {spoken}
      </span>
    </>
  );
}

/** @param {number} count */
function storiesLabel(count) {
  return `${count} ${count === 1 ? 'story' : 'stories'}`;
}
