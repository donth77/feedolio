import { lazy, Suspense } from 'react';
import { Link, NavLink } from 'react-router';
import { tagPath } from '../features/ai/rules/useRules.js';
import { pressFeed, stepFeed } from '../features/subscriptions/reorderTrigger.js';
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
 * @property {(id: string, to: number) => void} [onMoveFeed]  Lets the reader reorder feeds: drag, or Alt+↑/↓
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
  onMoveFeed,
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

      <NavLink to="/search" className={styles.search} aria-keyshortcuts="/" onClick={onNavigate}>
        <Icon name="search" size={18} />
        <span className={styles.searchLabel}>Search</span>
        <kbd className={styles.key} aria-hidden="true">
          /
        </kbd>
      </NavLink>

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
            {ai.rules && (
              <li>
                <NavLink to="/settings/rules" className={styles.item} onClick={onNavigate}>
                  <Icon name="filter" />
                  <span className={styles.label}>Rules</span>
                </NavLink>
              </li>
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
        <ul className={`${styles.items} ${styles.feedList}`} {...reorderable(onMoveFeed)}>
          {feeds.map((feed) => (
            <li key={feed.id} data-reorder-id={feed.id} data-reorder-label={feed.title}>
              <NavLink
                to={`/feeds/${feed.id}`}
                className={styles.item}
                onClick={onNavigate}
                draggable={false}
                aria-keyshortcuts={onMoveFeed && MOVE_KEYS}
              >
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
  onMoveFeed,
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

      <NavLink
        to="/search"
        className={styles.railItem}
        aria-label="Search"
        aria-keyshortcuts="/"
        title="Search (/)"
      >
        <Icon name="search" />
      </NavLink>

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
        {ai?.rules && (
          <li>
            <NavLink
              to="/settings/rules"
              className={styles.railItem}
              aria-label="Rules"
              title="Rules"
            >
              <Icon name="filter" />
            </NavLink>
          </li>
        )}
      </ul>

      <div className={styles.railRule} aria-hidden="true" />

      <ul
        className={`${styles.railItems} ${styles.feedList}`}
        aria-label="Feeds"
        {...reorderable(onMoveFeed)}
      >
        {feeds.map((feed) => (
          <li key={feed.id} data-reorder-id={feed.id} data-reorder-label={feed.title}>
            <NavLink
              to={`/feeds/${feed.id}`}
              className={styles.railItem}
              aria-label={feed.title}
              title={feed.title}
              draggable={false}
              aria-keyshortcuts={onMoveFeed && MOVE_KEYS}
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

/** The keys that move a focused feed, as aria-keyshortcuts names them. */
const MOVE_KEYS = 'Alt+ArrowUp Alt+ArrowDown';

/**
 * Handlers that let the reader reorder a feed list: drag with a mouse or pen,
 * or Alt+↑/↓ on a focused feed. The work loads on first use.
 *
 * @param {NavPanelProps['onMoveFeed']} onMoveFeed
 */
function reorderable(onMoveFeed) {
  if (!onMoveFeed) return {};
  return {
    /** @param {import('react').PointerEvent<HTMLUListElement>} event */
    onPointerDown: (event) => pressFeed(event, onMoveFeed),
    /** @param {import('react').KeyboardEvent<HTMLUListElement>} event */
    onKeyDown: (event) => stepFeed(event, onMoveFeed),
    // A link would otherwise start the browser's own drag of its address.
    /** @param {import('react').DragEvent} event */
    onDragStart: (event) => event.preventDefault(),
  };
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
