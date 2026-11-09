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
 * Writes the reader's data. Returns false when storage is full or blocked; the
 * app keeps working from memory either way.
 *
 * @param {RootState} state
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
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** The slices that are saved; a change to any of them schedules a save. */
const SAVED_SLICES = /** @type {const} */ (['subscriptions', 'bookmarks', 'preferences', 'visits']);

/**
 * Saves after the saved slices change, at most every SAVE_INTERVAL_MS, and at
 * once on flush() (when the page is hidden or closed).
 *
 * @param {() => RootState} getState
 */
export function createSaver(getState) {
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  let last = pick(getState());

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const state = getState();
    last = pick(state);
    save(state);
  };

  return {
    /** Call after every action. */
    changed() {
      const next = pick(getState());
      if (SAVED_SLICES.every((slice) => next[slice] === last[slice])) return;
      timer ??= setTimeout(flush, SAVE_INTERVAL_MS);
    },
    flush() {
      if (timer) flush();
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
