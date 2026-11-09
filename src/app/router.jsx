import { createBrowserRouter } from 'react-router';
import AppShell from '../components/AppShell.jsx';
import AllStories from '../features/feeds/AllStories.jsx';
import FeedView from '../features/feeds/FeedView.jsx';
import TodayView from '../features/feeds/TodayView.jsx';
import NotFound from './NotFound.jsx';
import RootLayout from './RootLayout.jsx';
import RouteError from './RouteError.jsx';
import ViewLoading from './ViewLoading.jsx';

/**
 * Loads a view's code only when a reader first opens it.
 *
 * @param {() => Promise<{ default: import('react').ComponentType }>} load
 */
const lazyView = (load) => async () => ({ Component: (await load()).default });

/** @type {import('react-router').RouteObject[]} */
export const routes = [
  {
    Component: RootLayout,
    ErrorBoundary: RouteError,
    HydrateFallback: ViewLoading,
    children: [
      {
        // A story is its own page, without the sidebar: a quiet place to read.
        path: '/feeds/:feedId/stories/:storyId',
        ErrorBoundary: RouteError,
        lazy: lazyView(() => import('../features/story/StoryPage.jsx')),
      },
      {
        path: '/',
        Component: AppShell,
        children: [
          {
            // Errors and first-load waits show inside the shell, so its links keep working.
            ErrorBoundary: RouteError,
            HydrateFallback: ViewLoading,
            children: [
              { index: true, Component: AllStories },
              { path: 'today', Component: TodayView },
              { path: 'feeds/:feedId', Component: FeedView },
              {
                path: 'bookmarks',
                lazy: lazyView(() => import('../features/bookmarks/SavedView.jsx')),
              },
              {
                path: 'search',
                lazy: lazyView(() => import('../features/search/SearchPage.jsx')),
              },
              {
                path: 'settings',
                lazy: lazyView(() => import('../features/subscriptions/Settings.jsx')),
              },
              {
                path: 'settings/ai',
                lazy: lazyView(() => import('../features/ai/AiSettings.jsx')),
              },
              {
                path: 'settings/rules',
                lazy: lazyView(() => import('../features/ai/rules/RulesEditor.jsx')),
              },
              {
                path: 'catch-up',
                lazy: lazyView(() => import('../features/ai/digest/CatchUp.jsx')),
              },
              {
                path: 'maybe',
                lazy: lazyView(() => import('../features/ai/rules/MaybeView.jsx')),
              },
              {
                path: 'hidden',
                lazy: lazyView(() => import('../features/ai/rules/HiddenView.jsx')),
              },
              {
                path: 'tags/:tag',
                lazy: lazyView(() => import('../features/ai/rules/TagView.jsx')),
              },
              { path: '*', Component: NotFound },
            ],
          },
        ],
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
