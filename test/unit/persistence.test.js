import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSaver,
  loadSaved,
  SAVE_INTERVAL_MS,
  save,
  STORAGE_KEY,
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
    });

    expect(loadSaved()).toEqual({
      subscriptions: [SUBSCRIPTION],
      bookmarks: [BOOKMARK],
      preferences: { theme: 'dark' },
    });
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

describe('save', () => {
  it('writes the reader’s data under one versioned key', () => {
    expect(save(/** @type {any} */ (appState()))).toBe(true);

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
    });
  });

  it('reports when storage is full', () => {
    vi.stubGlobal('localStorage', fakeStorage({ full: true }));
    expect(save(/** @type {any} */ (appState()))).toBe(false);
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
});
