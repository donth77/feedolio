import { configureStore } from '@reduxjs/toolkit';
import auth from '../features/auth/authSlice.js';
import bookmarks, { restoreBookmarks } from '../features/bookmarks/bookmarksSlice.js';
import { feedApi } from '../features/feeds/feedApi.js';
import preferences, { restorePreferences } from '../features/preferences/preferencesSlice.js';
import subscriptions, {
  restoreSubscriptions,
} from '../features/subscriptions/subscriptionsSlice.js';
import { createSaver, loadSaved } from './persistence.js';
import visits, { restoreVisits } from './visitsSlice.js';

/**
 * Builds the store from whatever the reader saved on this device, and keeps
 * saving their data as it changes.
 */
export function makeStore() {
  const saved = loadSaved();
  /** @type {ReturnType<typeof createSaver>|undefined} */
  let saver;

  /** @type {import('@reduxjs/toolkit').Middleware} */
  const saveChanges = (api) => {
    saver = createSaver(api.getState);
    return (next) => (action) => {
      const result = next(action);
      saver?.changed();
      return result;
    };
  };

  const store = configureStore({
    reducer: {
      subscriptions,
      bookmarks,
      preferences,
      visits,
      auth,
      [feedApi.reducerPath]: feedApi.reducer,
    },
    preloadedState: {
      subscriptions: restoreSubscriptions(saved.subscriptions),
      bookmarks: restoreBookmarks(saved.bookmarks),
      preferences: restorePreferences(saved.preferences),
      visits: restoreVisits(saved.visits),
    },
    middleware: (getDefault) => getDefault().concat(feedApi.middleware, saveChanges),
  });

  return Object.assign(store, {
    /** Saves pending changes now, e.g. when the page is closing. */
    flushSaves: () => saver?.flush(),
  });
}

/** @typedef {ReturnType<typeof makeStore>} AppStore */
/** @typedef {ReturnType<AppStore['getState']>} RootState */
