import { configureStore } from '@reduxjs/toolkit';
import aiSettings, {
  decisionRemoved,
  decisionSaved,
  featureToggled,
  generalModelChosen,
  generalSaved,
  restoreAiSettings,
} from '../features/ai/aiSettingsSlice.js';
import judgments, {
  judgmentAnswered,
  judgmentsCleared,
  judgmentsLoaded,
} from '../features/ai/rules/judgmentsSlice.js';
import rules, {
  restoreRules,
  ruleAdded,
  ruleEdited,
  ruleRestored,
  ruleToggled,
} from '../features/ai/rules/rulesSlice.js';
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

  const checks = ruleCheckListener();

  const store = configureStore({
    reducer: {
      subscriptions,
      bookmarks,
      preferences,
      visits,
      aiSettings,
      rules,
      judgments,
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
      rules: restoreRules(saved.rules),
      auth: authStateFor(user),
    },
    middleware: (getDefault) =>
      getDefault().concat(feedApi.middleware, saveChanges, checks.middleware),
  });

  /** Reads the current account's rule judgments, if it has any. */
  const loadJudgments = () => {
    const { rules: current } = store.getState();
    if (current.ids.length === 0 && !current.judged) {
      store.dispatch(judgmentsLoaded([]));
      return;
    }
    void import('../features/ai/rules/ruleChecks.js').then((module) => module.loadJudgments(store));
  };
  loadJudgments();

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
    store.dispatch(judgmentsCleared());
    loadJudgments();
    const guestBookmarks = loadSaved(STORAGE_KEY).bookmarks?.length ?? 0;
    if (firstTime && guestBookmarks > 0) store.dispatch(guestImportOffered(guestBookmarks));
  };

  return Object.assign(store, {
    /** Saves pending changes now, e.g. when the page is closing. */
    flushSaves: () => saver?.flush(),
    /** Stops saving and rule checks, for a store that's being replaced (tests start a new app per test). */
    stopSaving: () => {
      saver?.cancel();
      checks.stop();
    },
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

/**
 * Checks new stories against the reader's rules, a moment after anything
 * that could need it: new feed data, a rule change, judgments loading, or AI
 * being set up. A newer trigger replaces a check in progress. The checking
 * code loads only for readers with rules.
 */
function ruleCheckListener() {
  const TRIGGERS = [
    ruleAdded,
    ruleEdited,
    ruleToggled,
    ruleRestored,
    judgmentsLoaded,
    generalSaved,
    generalModelChosen,
    decisionSaved,
    decisionRemoved,
    featureToggled,
  ];
  const load = () => import('../features/ai/rules/ruleChecks.js');
  /** @type {ReturnType<typeof setTimeout>|null} */
  let waiting = null;
  /** @type {AbortController|null} */
  let running = null;

  const stop = () => {
    if (waiting) clearTimeout(waiting);
    waiting = null;
    running?.abort();
    running = null;
  };

  /** @type {import('@reduxjs/toolkit').Middleware} */
  const middleware = (api) => (next) => (action) => {
    const result = next(action);
    // The reader's answers in Maybe and Hidden are saved as they're given.
    if (judgmentAnswered.match(action)) {
      void load().then((module) => module.saveAnswer(api.getState(), action.payload));
      return result;
    }
    const trigger =
      feedApi.endpoints.getFeed.matchFulfilled(action) ||
      TRIGGERS.some((creator) => creator.match(action));
    const state = /** @type {RootState} */ (api.getState());
    if (!trigger || state.rules.ids.length === 0 || !state.aiSettings.general) return result;
    stop();
    waiting = setTimeout(async () => {
      waiting = null;
      const controller = new AbortController();
      running = controller;
      const { runRuleChecks } = await load();
      if (controller.signal.aborted) return;
      await runRuleChecks({
        getState: api.getState,
        dispatch: api.dispatch,
        signal: controller.signal,
      });
      if (running === controller) running = null;
    }, 700);
    return result;
  };
  return { middleware, stop };
}

/** @typedef {ReturnType<typeof makeStore>} AppStore */
/** @typedef {ReturnType<AppStore['getState']>} RootState */
