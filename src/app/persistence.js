/**
 * Saves the reader's own data in localStorage under one versioned key, and
 * loads it back at start-up. Feed data is never stored: it comes fresh from
 * the Worker. Each signed-in account has its own key (feedolio:v1:<user id>);
 * signed-out reading uses feedolio:v1.
 *
 * Stored shape (version 1):
 *   { version: 1, subscriptions: Subscription[], bookmarks: Bookmark[],
 *     preferences: Preferences, visits: Visits, aiSettings: AiSettings,
 *     rules: { list: Rule[], judged: boolean } }
 *
 * AI keys are never part of it: they live apart, in features/ai/keys.js.
 *
 * Anything missing, corrupted or unreadable falls back to defaults; storage
 * that can't be used (private browsing, blocked cookies) never breaks the app.
 */

/** Where a guest's data is saved. */
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
 * @property {Record<string, unknown>} [aiSettings]
 * @property {Record<string, unknown>} [rules]
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
 * Where an account's data is saved: the guest key, or the guest key plus the
 * user's id.
 *
 * @param {string|null|undefined} userId
 */
export function storageKeyFor(userId) {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

/**
 * Whether anything was ever saved under this key.
 *
 * @param {string} key
 */
export function hasSaved(key) {
  try {
    return storage()?.getItem(key) != null;
  } catch {
    return false;
  }
}

/**
 * Reads and checks the saved data. Each part is kept only if it looks right.
 *
 * @param {string} [key]
 * @returns {SavedData}
 */
export function loadSaved(key = STORAGE_KEY) {
  let raw;
  try {
    raw = storage()?.getItem(key);
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
  if (isObject(parsed.aiSettings)) saved.aiSettings = parsed.aiSettings;
  if (isObject(parsed.rules)) saved.rules = parsed.rules;
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
 * @param {string} [key]
 * @returns {SaveResult}
 */
export function save(state, key = STORAGE_KEY) {
  const data = {
    version: VERSION,
    // In the reader's order.
    subscriptions: state.subscriptions.ids.map((id) => state.subscriptions.entities[id]),
    bookmarks: Object.values(state.bookmarks.entities),
    preferences: state.preferences,
    visits: {
      lastVisitAt: state.visits.lastVisitAt,
      lastCatchUpAt: state.visits.lastCatchUpAt,
      openedIds: state.visits.openedIds,
    },
    aiSettings: state.aiSettings,
    rules: {
      list: state.rules.ids.map((id) => state.rules.entities[id]),
      judged: state.rules.judged,
    },
  };
  const target = storage();
  if (!target) return 'unavailable';
  try {
    target.setItem(key, JSON.stringify(data));
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
const SAVED_SLICES = /** @type {const} */ ([
  'subscriptions',
  'bookmarks',
  'preferences',
  'visits',
  'aiSettings',
  'rules',
]);

/**
 * Saves after the saved slices change, at most every SAVE_INTERVAL_MS, and at
 * once on flush() (when the page is hidden or closed).
 *
 * @param {() => RootState} getState
 * @param {(result: Exclude<SaveResult, 'saved'>) => void} [onFailure]  Told when a save fails
 * @param {(state: RootState) => string} [keyOf]  Where this state is saved
 */
export function createSaver(getState, onFailure = () => {}, keyOf = () => STORAGE_KEY) {
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  let last = pick(getState());
  /** Set once this store is going away: it never saves again. */
  let stopped = false;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const state = getState();
    last = pick(state);
    const result = save(state, keyOf(state));
    if (result !== 'saved') onFailure(result);
  };

  return {
    /** Call after every action. */
    changed() {
      if (stopped) return;
      const next = pick(getState());
      if (SAVED_SLICES.every((slice) => next[slice] === last[slice])) return;
      timer ??= setTimeout(flush, SAVE_INTERVAL_MS);
    },
    /** Saves a pending change now. */
    flush() {
      if (timer) flush();
    },
    /**
     * Drops a pending save without writing it, when this store is going away.
     * Nothing it does afterwards is saved, so it can't overwrite its successor.
     */
    cancel() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
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
