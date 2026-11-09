import { configureStore } from '@reduxjs/toolkit';
import auth from '../features/auth/authSlice.js';
import bookmarks, { restoreBookmarks } from '../features/bookmarks/bookmarksSlice.js';
import { feedApi } from '../features/feeds/feedApi.js';
import preferences, { restorePreferences } from '../features/preferences/preferencesSlice.js';
import subscriptions, {
  restoreSubscriptions,
} from '../features/subscriptions/subscriptionsSlice.js';
import { persistedStateHydrated } from './actions.js';
import { createSaver, loadSaved } from './persistence.js';
import toast, { toastShown } from './toastSlice.js';
import visits, { restoreVisits } from './visitsSlice.js';

/** What the reader is told when saving fails. */
const SAVE_FAILURES = {
  full: 'Storage is full, so your latest changes weren’t saved. Remove some saved stories to make room.',
  unavailable:
    'This browser isn’t letting Feedolio save, so bookmarks and settings will be lost when you close it.',
};

/**
 * Builds the store from whatever the reader saved on this device, and keeps
 * saving their data as it changes.
 */
export function makeStore() {
  const saved = loadSaved();
  /** @type {ReturnType<typeof createSaver>|undefined} */
  let saver;
  let warnedUnavailable = false;

  /** @type {import('@reduxjs/toolkit').Middleware} */
  const saveChanges = (api) => {
    saver = createSaver(api.getState, (failure) => {
      // A full store is worth repeating; blocked storage only needs saying once.
      if (failure === 'unavailable' && warnedUnavailable) return;
      warnedUnavailable ||= failure === 'unavailable';
      api.dispatch(toastShown({ message: SAVE_FAILURES[failure], tone: 'warning' }));
    });
    return (next) => (action) => {
      const result = next(action);
      if (persistedStateHydrated.match(action)) saver?.synced();
      else saver?.changed();
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
      toast,
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
    /** Stops saving, for a store that's being replaced (tests start a new app per test). */
    stopSaving: () => saver?.cancel(),
    /** Takes in what another tab saved. */
    reloadSaved: () => store.dispatch(persistedStateHydrated(loadSaved())),
  });
}

/** @typedef {ReturnType<typeof makeStore>} AppStore */
/** @typedef {ReturnType<AppStore['getState']>} RootState */
