/**
 * Saves the reader's own data in localStorage under one versioned key, and
 * loads it back at start-up. Feed data is never stored: it comes fresh from
 * the Worker.
 *
 * Stored shape (version 1):
 *   { version: 1, subscriptions: Subscription[], bookmarks: Bookmark[],
 *     preferences: Preferences, visits: Visits }
 *
 * Anything missing, corrupted or unreadable falls back to defaults; storage
 * that can't be used (private browsing, blocked cookies) never breaks the app.
 */

export const STORAGE_KEY = 'feedolio:v1';
const VERSION = 1;
/** Saves happen at most this often. */
export const SAVE_INTERVAL_MS = 500;

/** @typedef {import('./store.js').RootState} RootState */
/** @typedef {import('../features/subscriptions/subscriptionsSlice.js').Subscription} Subscription */
/** @typedef {import('../features/bookmarks/bookmarksSlice.js').Bookmark} Bookmark */
/** @typedef {import('../features/preferences/preferencesSlice.js').Preferences} Preferences */

/**
 * The saved parts of the state, in storage form.
 *
 * @typedef {Object} SavedData
 * @property {Subscription[]} [subscriptions]
 * @property {Bookmark[]} [bookmarks]
 * @property {Partial<Preferences>} [preferences]
 * @property {Record<string, unknown>} [visits]
 */

/** @returns {Storage|null} */
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Reads and checks the saved data. Each part is kept only if it looks right.
 *
 * @returns {SavedData}
 */
export function loadSaved() {
  let raw;
  try {
    raw = storage()?.getItem(STORAGE_KEY);
  } catch {
    return {};
  }
  if (!raw) return {};

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isObject(parsed) || parsed.version !== VERSION) return {};

  /** @type {SavedData} */
  const saved = {};
  if (Array.isArray(parsed.subscriptions)) {
    saved.subscriptions = parsed.subscriptions.filter(isSubscription);
  }
  if (Array.isArray(parsed.bookmarks)) saved.bookmarks = parsed.bookmarks.filter(isBookmark);
  if (isObject(parsed.preferences)) saved.preferences = parsed.preferences;
  if (isObject(parsed.visits)) saved.visits = parsed.visits;
  return saved;
}

/**
 * How a save went. The app keeps working from memory either way.
 * - saved
 * - full: the browser's storage quota is used up
 * - unavailable: storage is blocked, as in some private-browsing modes
 *
 * @typedef {'saved'|'full'|'unavailable'} SaveResult
 */

/**
 * Writes the reader's data.
 *
 * @param {RootState} state
 * @returns {SaveResult}
 */
export function save(state) {
  const data = {
    version: VERSION,
    subscriptions: Object.values(state.subscriptions.entities),
    bookmarks: Object.values(state.bookmarks.entities),
    preferences: state.preferences,
    visits: {
      lastVisitAt: state.visits.lastVisitAt,
      lastCatchUpAt: state.visits.lastCatchUpAt,
      openedIds: state.visits.openedIds,
    },
  };
  const target = storage();
  if (!target) return 'unavailable';
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(data));
    return 'saved';
  } catch (error) {
    return isQuotaError(error) ? 'full' : 'unavailable';
  }
}

/** @param {unknown} error */
function isQuotaError(error) {
  if (!(error instanceof DOMException)) return false;
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || // Older Firefox
    error.code === 22 ||
    error.code === 1014
  );
}

/** The slices that are saved; a change to any of them schedules a save. */
const SAVED_SLICES = /** @type {const} */ (['subscriptions', 'bookmarks', 'preferences', 'visits']);

/**
 * Saves after the saved slices change, at most every SAVE_INTERVAL_MS, and at
 * once on flush() (when the page is hidden or closed).
 *
 * @param {() => RootState} getState
 * @param {(result: Exclude<SaveResult, 'saved'>) => void} [onFailure]  Told when a save fails
 */
export function createSaver(getState, onFailure = () => {}) {
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  let last = pick(getState());

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const state = getState();
    last = pick(state);
    const result = save(state);
    if (result !== 'saved') onFailure(result);
  };

  return {
    /** Call after every action. */
    changed() {
      const next = pick(getState());
      if (SAVED_SLICES.every((slice) => next[slice] === last[slice])) return;
      timer ??= setTimeout(flush, SAVE_INTERVAL_MS);
    },
    /** Saves a pending change now. */
    flush() {
      if (timer) flush();
    },
    /**
     * The state now matches storage (it was just loaded from it), so there's
     * nothing to save. Writing it back would only echo it to other tabs.
     */
    synced() {
      if (timer) clearTimeout(timer);
      timer = null;
      last = pick(getState());
    },
  };
}

/** @param {RootState} state */
function pick(state) {
  return Object.fromEntries(SAVED_SLICES.map((slice) => [slice, state[slice]]));
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value */
function isSubscription(value) {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.url === 'string' &&
    typeof value.title === 'string' &&
    typeof value.enabled === 'boolean' &&
    typeof value.isDefault === 'boolean' &&
    typeof value.addedAt === 'string'
  );
}

/** @param {unknown} value */
function isBookmark(value) {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.feedId === 'string' &&
    typeof value.feedTitle === 'string' &&
    typeof value.savedAt === 'string' &&
    isObject(value.story) &&
    typeof value.story.id === 'string' &&
    typeof value.story.title === 'string'
  );
}
