import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSaver,
  hasSaved,
  loadSaved,
  SAVE_INTERVAL_MS,
  save,
  STORAGE_KEY,
  storageKeyFor,
} from '../../src/app/persistence.js';

/**
 * A minimal stand-in for the browser's localStorage.
 *
 * @param {{ full?: boolean }} [options]  full: every write fails, as when the quota is used up
 */
function fakeStorage({ full = false } = {}) {
  const items = new Map();
  return {
    getItem: (/** @type {string} */ key) => items.get(key) ?? null,
    setItem: vi.fn((/** @type {string} */ key, /** @type {string} */ value) => {
      if (full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      items.set(key, String(value));
    }),
  };
}

const SUBSCRIPTION = {
  id: 'f_1',
  url: 'https://news.test/feed',
  title: 'News',
  enabled: true,
  isDefault: false,
  addedAt: '2026-11-01T00:00:00.000Z',
};

const BOOKMARK = {
  id: 's_1',
  feedId: 'f_1',
  feedTitle: 'News',
  savedAt: '2026-11-02T00:00:00.000Z',
  story: { id: 's_1', title: 'A story' },
};

/** AI setup, which never holds a key: keys are kept apart (features/ai/keys.js). */
const AI_SETTINGS = {
  general: {
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-opus-5-5',
    traits: {},
  },
  decision: null,
  features: { actions: true, rules: true, catchUp: true },
  translateTo: 'es',
  rememberKeys: true,
};

/** A store state with the saved slices, as the app holds them. */
function appState() {
  return {
    subscriptions: { ids: ['f_1'], entities: { f_1: SUBSCRIPTION } },
    bookmarks: { ids: ['s_1'], entities: { s_1: BOOKMARK } },
    preferences: { theme: 'dark' },
    visits: {
      lastVisitAt: '2026-11-05T00:00:00.000Z',
      lastCatchUpAt: null,
      openedIds: ['s_1'],
      cutoff: '2026-11-04T00:00:00.000Z',
    },
    aiSettings: AI_SETTINGS,
    feedApi: {},
  };
}

/** @param {unknown} data */
const store = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('loadSaved', () => {
  it('starts empty when nothing usable is saved', () => {
    expect(loadSaved()).toEqual({});

    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadSaved()).toEqual({});

    store({ version: 2, subscriptions: [SUBSCRIPTION] });
    expect(loadSaved()).toEqual({});

    store([SUBSCRIPTION]);
    expect(loadSaved()).toEqual({});
  });

  it('keeps only the parts that look right', () => {
    store({
      version: 1,
      subscriptions: [SUBSCRIPTION, { ...SUBSCRIPTION, id: 7 }, null],
      bookmarks: [BOOKMARK, { ...BOOKMARK, story: 'a story' }],
      preferences: { theme: 'dark' },
      visits: 'yesterday',
      aiSettings: ['not', 'settings'],
    });

    expect(loadSaved()).toEqual({
      subscriptions: [SUBSCRIPTION],
      bookmarks: [BOOKMARK],
      preferences: { theme: 'dark' },
    });

    store({ version: 1, aiSettings: AI_SETTINGS });
    expect(loadSaved()).toEqual({ aiSettings: AI_SETTINGS });
  });

  it('copes with storage the browser blocks', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new DOMException('Access denied', 'SecurityError');
      },
    });
    expect(loadSaved()).toEqual({});
  });
});

describe('accounts', () => {
  it('keeps each signed-in account’s data under its own key', () => {
    expect(storageKeyFor(null)).toBe(STORAGE_KEY);
    expect(storageKeyFor('github|101')).toBe(`${STORAGE_KEY}:github|101`);

    expect(save(/** @type {any} */ (appState()), storageKeyFor('github|101'))).toBe('saved');
    expect(hasSaved(storageKeyFor('github|101'))).toBe(true);
    expect(hasSaved(STORAGE_KEY)).toBe(false);
    expect(loadSaved(storageKeyFor('github|101')).bookmarks).toEqual([BOOKMARK]);
    expect(loadSaved()).toEqual({});
  });

  it('treats storage it can’t read as empty', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new DOMException('Access denied', 'SecurityError');
      },
    });
    expect(hasSaved(STORAGE_KEY)).toBe(false);
  });

  it('saves to the key the state belongs to', () => {
    vi.useFakeTimers();
    let state = appState();
    const saver = createSaver(
      () => /** @type {any} */ (state),
      () => {},
      () => storageKeyFor('github|202'),
    );

    state = { ...state, preferences: { theme: 'dark' } };
    saver.changed();
    vi.runAllTimers();
    expect(hasSaved(storageKeyFor('github|202'))).toBe(true);
    expect(hasSaved(STORAGE_KEY)).toBe(false);
  });
});

describe('save', () => {
  it('writes the reader’s data under one versioned key', () => {
    expect(save(/** @type {any} */ (appState()))).toBe('saved');

    expect(JSON.parse(/** @type {string} */ (localStorage.getItem(STORAGE_KEY)))).toEqual({
      version: 1,
      subscriptions: [SUBSCRIPTION],
      bookmarks: [BOOKMARK],
      preferences: { theme: 'dark' },
      visits: {
        lastVisitAt: '2026-11-05T00:00:00.000Z',
        lastCatchUpAt: null,
        openedIds: ['s_1'],
      },
      aiSettings: AI_SETTINGS,
    });
  });

  it('reports when storage is full', () => {
    vi.stubGlobal('localStorage', fakeStorage({ full: true }));
    expect(save(/** @type {any} */ (appState()))).toBe('full');
  });

  it('reports when the browser won’t store anything', () => {
    vi.stubGlobal('localStorage', {
      setItem() {
        throw new DOMException('Access denied', 'SecurityError');
      },
    });
    expect(save(/** @type {any} */ (appState()))).toBe('unavailable');

    vi.stubGlobal('localStorage', undefined);
    expect(save(/** @type {any} */ (appState()))).toBe('unavailable');
  });
});

describe('createSaver', () => {
  it('saves a change once, after a short pause', () => {
    vi.useFakeTimers();
    let state = appState();
    const saver = createSaver(() => /** @type {any} */ (state));

    state = { ...state, preferences: { theme: 'light' } };
    saver.changed();
    state = { ...state, preferences: { theme: 'system' } };
    saver.changed();
    vi.advanceTimersByTime(SAVE_INTERVAL_MS - 1);
    expect(localStorage.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(/** @type {string} */ (localStorage.getItem(STORAGE_KEY))).preferences,
    ).toEqual({ theme: 'system' });
  });

  it('ignores changes to data that isn’t saved', () => {
    vi.useFakeTimers();
    let state = appState();
    const saver = createSaver(() => /** @type {any} */ (state));

    state = { ...state, feedApi: { loading: true } };
    saver.changed();
    vi.runAllTimers();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('writes a pending change at once when the page is hidden', () => {
    vi.useFakeTimers();
    let state = appState();
    const saver = createSaver(() => /** @type {any} */ (state));

    saver.flush();
    expect(localStorage.setItem).not.toHaveBeenCalled();

    state = { ...state, bookmarks: { ids: [], entities: {} } };
    saver.changed();
    saver.flush();
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it('tells the app when a save fails', () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', fakeStorage({ full: true }));
    let state = appState();
    const onFailure = vi.fn();
    const saver = createSaver(() => /** @type {any} */ (state), onFailure);

    state = { ...state, preferences: { theme: 'light' } };
    saver.changed();
    vi.runAllTimers();
    expect(onFailure).toHaveBeenCalledWith('full');
  });

  it('drops a pending save when the store is going away', () => {
    vi.useFakeTimers();
    let state = appState();
    const saver = createSaver(() => /** @type {any} */ (state));

    state = { ...state, preferences: { theme: 'light' } };
    saver.changed();
    saver.cancel();
    vi.runAllTimers();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('doesn’t write back data that was just loaded from another tab', () => {
    vi.useFakeTimers();
    let state = appState();
    const saver = createSaver(() => /** @type {any} */ (state));

    state = { ...state, bookmarks: { ids: [], entities: {} } };
    saver.changed();
    saver.synced();
    vi.runAllTimers();
    saver.changed();
    vi.runAllTimers();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});
