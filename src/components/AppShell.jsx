import { lazy, Suspense, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { tagPath, useAiNav, useWithoutHidden } from '../features/ai/rules/useRules.js';
import { selectAuth } from '../features/auth/authSlice.js';
import { selectBookmarkCount } from '../features/bookmarks/bookmarksSlice.js';
import {
  inLastDay,
  lookOf,
  mergeStories,
  useFeedStates,
  useLoadFeeds,
} from '../features/feeds/useFeeds.js';
import { selectSidebar, sidebarChanged } from '../features/preferences/preferencesSlice.js';
import AddFeedDialog from '../features/subscriptions/AddFeedDialog.jsx';
import { AddFeedContext } from '../features/subscriptions/addFeedContext.js';
import {
  selectAllSubscriptions,
  selectEnabledSubscriptions,
} from '../features/subscriptions/subscriptionsSlice.js';
import { skipToMain } from '../lib/skipToMain.js';
import { useMediaQuery } from '../lib/useMediaQuery.js';
import { useNow } from '../lib/useNow.js';
import styles from './AppShell.module.css';
import Drawer from './Drawer.jsx';
import Icon from './Icon.jsx';
import { FeedDot } from './Monogram.jsx';
import NavPanel, { Wordmark } from './NavPanel.jsx';

const GuestImportPrompt = lazy(() =>
  import('../features/auth/AccountPanel.jsx').then((module) => ({
    default: module.GuestImportPrompt,
  })),
);

/**
 * The frame around every view, by width:
 * - 1024 px and up: a sidebar with sections and feeds. It collapses to a 64 px
 *   icon rail (button or `[`); without a choice from the reader it's
 *   expanded from 1280 px and a rail below that.
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
  // Hidden feeds stay in the sidebar and chips, so they can still be opened.
  const feeds = useSelector(selectAllSubscriptions).map(lookOf);
  const allLoaded = states.every((state) => state.status !== 'loading');
  const { stories: visible } = useWithoutHidden(mergeStories(states));
  const todayCount = allLoaded ? inLastDay(visible, now).length : null;
  const aiNav = useAiNav();
  const savedCount = useSelector(selectBookmarkCount);
  const offeringGuestImport = useSelector(selectAuth).guestBookmarks > 0;

  const dispatch = useDispatch();
  const sidebar = useSelector(selectSidebar);
  const roomy = useMediaQuery('(min-width: 1280px)', true);
  const railed = sidebar === 'collapsed' || (sidebar === 'auto' && !roomy);
  const toggleSidebar = () => dispatch(sidebarChanged(railed ? 'expanded' : 'collapsed'));

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // From the drawer, the dialog replaces it rather than stacking on top.
  const openAddFeed = useCallback(() => {
    setDrawerOpen(false);
    setAddOpen(true);
  }, []);
  const { pathname } = useLocation();
  const isStories = pathname === '/' || pathname === '/today' || pathname.startsWith('/feeds/');

  return (
    <AddFeedContext.Provider value={openAddFeed}>
      <div className={styles.shell} data-rail={railed}>
        <a href="#main" className={styles.skip} onClick={skipToMain}>
          Skip to content
        </a>
        <div className={styles.sidebar}>
          <NavPanel
            id="sidebar"
            label="Sections and feeds"
            feeds={feeds}
            todayCount={todayCount}
            savedCount={savedCount}
            onAddFeed={openAddFeed}
            collapsed={railed}
            onToggle={toggleSidebar}
            className={styles.sidebarPanel}
            ai={aiNav}
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
            <button
              type="button"
              className={styles.addButton}
              aria-label="Add feed"
              onClick={openAddFeed}
            >
              <Icon name="add" size={22} />
            </button>
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
              {aiNav.catchUp && (
                <li>
                  <NavLink to="/catch-up" className={styles.chip}>
                    <Icon name="sparkle" size={14} />
                    Catch me up
                  </NavLink>
                </li>
              )}
              {aiNav.ruleViews && (
                <>
                  <li>
                    <NavLink to="/maybe" className={styles.chip}>
                      Maybe {aiNav.maybe > 0 && aiNav.maybe}
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/hidden" className={styles.chip}>
                      Hidden {aiNav.hidden > 0 && aiNav.hidden}
                    </NavLink>
                  </li>
                </>
              )}
              {aiNav.tags.map(({ tag }) => (
                <li key={tag}>
                  <NavLink to={tagPath(tag)} className={styles.chip}>
                    <Icon name="tag" size={14} />
                    {tag}
                  </NavLink>
                </li>
              ))}
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

          <main id="main" className={styles.main} tabIndex={-1}>
            {offeringGuestImport && (
              <Suspense fallback={null}>
                <GuestImportPrompt />
              </Suspense>
            )}
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
            savedCount={savedCount}
            onAddFeed={openAddFeed}
            onNavigate={() => setDrawerOpen(false)}
            ai={aiNav}
          />
        </Drawer>

        <AddFeedDialog open={addOpen} onClose={() => setAddOpen(false)} />
      </div>
    </AddFeedContext.Provider>
  );
}
