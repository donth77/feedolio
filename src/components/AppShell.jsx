import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import {
  inLastDay,
  lookOf,
  mergeStories,
  useFeedStates,
  useLoadFeeds,
} from '../features/feeds/useFeeds.js';
import { selectEnabledSubscriptions } from '../features/subscriptions/subscriptionsSlice.js';
import { useNow } from '../lib/useNow.js';
import styles from './AppShell.module.css';
import Drawer from './Drawer.jsx';
import Icon from './Icon.jsx';
import { FeedDot } from './Monogram.jsx';
import NavPanel, { Wordmark } from './NavPanel.jsx';

/**
 * The frame around every view, by width:
 * - 1024 px and up: a sidebar with sections and feeds.
 * - 640–1023 px: a top bar whose menu button opens the same list in a drawer.
 * - Under 640 px: a top bar, scrolling chips to pick what to show, and tabs
 *   at the bottom.
 *
 * It also keeps every enabled feed loaded, so views and counts read from the
 * cache.
 */
export default function AppShell() {
  const subscriptions = useSelector(selectEnabledSubscriptions);
  useLoadFeeds(subscriptions);
  const states = useFeedStates(subscriptions);
  const now = useNow();
  const feeds = subscriptions.map(lookOf);
  const allLoaded = states.every((state) => state.status !== 'loading');
  const todayCount = allLoaded ? inLastDay(mergeStories(states), now).length : null;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const isStories = pathname === '/' || pathname === '/today' || pathname.startsWith('/feeds/');

  return (
    <div className={styles.shell}>
      <div className={styles.sidebar}>
        <NavPanel
          id="sidebar"
          label="Sections and feeds"
          feeds={feeds}
          todayCount={todayCount}
          className={styles.sidebarPanel}
        />
      </div>

      <div className={styles.column}>
        <header className={styles.topBar}>
          <button
            type="button"
            className={styles.menuButton}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="menu" size={22} />
          </button>
          <Wordmark />
        </header>

        <nav className={styles.chips} aria-label="Stories to show">
          <ul className={styles.chipList}>
            <li>
              <NavLink to="/today" className={styles.chip}>
                Today
              </NavLink>
            </li>
            <li>
              <NavLink to="/" end className={styles.chip}>
                All
              </NavLink>
            </li>
            {feeds.map((feed) => (
              <li key={feed.id}>
                <NavLink to={`/feeds/${feed.id}`} className={styles.chip}>
                  <FeedDot feed={feed} className={styles.chipDot} />
                  {feed.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main" className={styles.main}>
          <Outlet />
        </main>

        <nav className={styles.tabs} aria-label="Main">
          <Link to="/" className={styles.tab} aria-current={isStories ? 'page' : undefined}>
            <Icon name="stories" size={22} />
            Stories
          </Link>
          <NavLink to="/bookmarks" className={styles.tab}>
            <Icon name="saved" size={22} />
            Saved
          </NavLink>
          <NavLink to="/settings" className={styles.tab}>
            <Icon name="settings" size={22} />
            Settings
          </NavLink>
        </nav>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} label="Menu">
        <NavPanel
          label="Sections and feeds"
          feeds={feeds}
          todayCount={todayCount}
          onNavigate={() => setDrawerOpen(false)}
        />
      </Drawer>

      <ScrollRestoration />
    </div>
  );
}
