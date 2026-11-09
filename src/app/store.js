import { configureStore } from '@reduxjs/toolkit';
import aiSettings, { restoreAiSettings } from '../features/ai/aiSettingsSlice.js';
import auth, {
  authStateFor,
  guestImportClosed,
  guestImportOffered,
  signedIn,
  signedOut,
} from '../features/auth/authSlice.js';
import { readSession, writeSession } from '../features/auth/session.js';
import bookmarks, {
  bookmarksImported,
  restoreBookmarks,
} from '../features/bookmarks/bookmarksSlice.js';
import { feedApi } from '../features/feeds/feedApi.js';
import preferences, { restorePreferences } from '../features/preferences/preferencesSlice.js';
import subscriptions, {
  restoreSubscriptions,
} from '../features/subscriptions/subscriptionsSlice.js';
import { persistedStateHydrated } from './actions.js';
import { createSaver, hasSaved, loadSaved, STORAGE_KEY, storageKeyFor } from './persistence.js';
import toast, { toastShown } from './toastSlice.js';
import visits, { restoreVisits } from './visitsSlice.js';

/** What the reader is told when saving fails. */
const SAVE_FAILURES = {
  full: 'Storage is full, so your latest changes weren’t saved. Remove some saved stories to make room.',
  unavailable:
    'This browser isn’t letting Feedolio save, so bookmarks and settings will be lost when you close it.',
};

/** @typedef {import('../features/auth/session.js').AccountUser} AccountUser */

/**
 * Builds the store from whatever the signed-in reader (or the guest) saved on
 * this device, and keeps saving their data as it changes.
 */
export function makeStore() {
  const user = readSession();
  const saved = loadSaved(storageKeyFor(user?.id));
  /** @type {ReturnType<typeof createSaver>|undefined} */
  let saver;
  let warnedUnavailable = false;

  /** @param {{ auth: { user: AccountUser|null } }} state */
  const keyOf = (state) => storageKeyFor(state.auth.user?.id);

  /** @type {import('@reduxjs/toolkit').Middleware} */
  const saveChanges = (api) => {
    saver = createSaver(
      api.getState,
      (failure) => {
        // A full store is worth repeating; blocked storage only needs saying once.
        if (failure === 'unavailable' && warnedUnavailable) return;
        warnedUnavailable ||= failure === 'unavailable';
        api.dispatch(toastShown({ message: SAVE_FAILURES[failure], tone: 'warning' }));
      },
      keyOf,
    );
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
      aiSettings,
      auth,
      toast,
      [feedApi.reducerPath]: feedApi.reducer,
    },
    preloadedState: {
      subscriptions: restoreSubscriptions(saved.subscriptions),
      bookmarks: restoreBookmarks(saved.bookmarks),
      preferences: restorePreferences(saved.preferences),
      visits: restoreVisits(saved.visits),
      aiSettings: restoreAiSettings(saved.aiSettings),
      auth: authStateFor(user),
    },
    middleware: (getDefault) => getDefault().concat(feedApi.middleware, saveChanges),
  });

  /**
   * Switches whose data is shown: saves the current account's changes, then
   * loads the other account's. A first sign-in on this device offers to bring
   * over stories saved as a guest.
   *
   * @param {AccountUser|null} next
   * @param {{ remember?: boolean }} [options]  remember: false when another tab already did
   */
  const switchAccount = (next, { remember = true } = {}) => {
    saver?.flush();
    if (remember) writeSession(next);
    const key = storageKeyFor(next?.id);
    const firstTime = next !== null && !hasSaved(key);
    store.dispatch(next ? signedIn(next) : signedOut());
    store.dispatch(persistedStateHydrated(loadSaved(key)));
    const guestBookmarks = loadSaved(STORAGE_KEY).bookmarks?.length ?? 0;
    if (firstTime && guestBookmarks > 0) store.dispatch(guestImportOffered(guestBookmarks));
  };

  return Object.assign(store, {
    /** Saves pending changes now, e.g. when the page is closing. */
    flushSaves: () => saver?.flush(),
    /** Stops saving, for a store that's being replaced (tests start a new app per test). */
    stopSaving: () => saver?.cancel(),
    /** Where the current account's data is saved. */
    storageKey: () => keyOf(store.getState()),
    /** Takes in what another tab saved for the current account. */
    reloadSaved: () => store.dispatch(persistedStateHydrated(loadSaved(keyOf(store.getState())))),
    switchAccount,
    /** Another tab signed in or out: show the same account here. */
    followOtherTabs: () => {
      const other = readSession();
      if ((other?.id ?? null) !== (store.getState().auth.user?.id ?? null)) {
        switchAccount(other, { remember: false });
      }
    },
    /** Copies the guest's saved stories into the signed-in account. */
    importGuestBookmarks: () => {
      const guest = loadSaved(STORAGE_KEY).bookmarks ?? [];
      store.dispatch(bookmarksImported(guest));
      store.dispatch(guestImportClosed());
      return guest.length;
    },
  });
}

/** @typedef {ReturnType<typeof makeStore>} AppStore */
/** @typedef {ReturnType<AppStore['getState']>} RootState */
