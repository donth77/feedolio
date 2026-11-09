import { createEntityAdapter, createSlice } from '@reduxjs/toolkit';
import { persistedStateHydrated } from '../../app/actions.js';

/**
 * A saved story. It keeps a full copy of the story, so it still opens after
 * the story leaves its feed or the feed is removed.
 *
 * @typedef {Object} Bookmark
 * @property {string} id         Same as story.id
 * @property {string} feedId
 * @property {string} feedTitle  Kept so the bookmark renders even if the feed is removed
 * @property {string} savedAt    ISO timestamp
 * @property {import('../../lib/types.js').Story} story  Full copy taken when saved
 */

/** Most recently saved first. */
const bookmarksAdapter = createEntityAdapter({
  /** @type {(a: Bookmark, b: Bookmark) => number} */
  sortComparer: (a, b) => b.savedAt.localeCompare(a.savedAt),
});

const bookmarksSlice = createSlice({
  name: 'bookmarks',
  initialState: bookmarksAdapter.getInitialState(),
  reducers: {
    /** Saves the story, or un-saves it if it's already saved. */
    bookmarkToggled: {
      reducer(state, /** @type {{ payload: Bookmark }} */ { payload }) {
        if (state.entities[payload.id]) bookmarksAdapter.removeOne(state, payload.id);
        else bookmarksAdapter.addOne(state, payload);
      },
      /**
       * @param {import('../../lib/types.js').Story} story
       * @param {string} feedTitle
       */
      prepare: (story, feedTitle) => ({
        payload: {
          id: story.id,
          feedId: story.feedId,
          feedTitle,
          savedAt: new Date().toISOString(),
          story,
        },
      }),
    },
    /** @param {{ payload: string }} action  The story id */
    bookmarkRemoved(state, { payload }) {
      bookmarksAdapter.removeOne(state, payload);
    },
    /** Puts back a removed bookmark, with its original saved time (Undo). */
    bookmarkRestored(state, /** @type {{ payload: Bookmark }} */ { payload }) {
      bookmarksAdapter.upsertOne(state, payload);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(persistedStateHydrated, (_state, { payload }) =>
      restoreBookmarks(payload.bookmarks),
    );
  },
});

export const { bookmarkToggled, bookmarkRemoved, bookmarkRestored } = bookmarksSlice.actions;
export default bookmarksSlice.reducer;

/**
 * The bookmarks slice from saved data.
 *
 * @param {Bookmark[]|undefined} saved
 */
export function restoreBookmarks(saved) {
  return bookmarksAdapter.setAll(bookmarksAdapter.getInitialState(), saved ?? []);
}

/** @typedef {{ bookmarks: ReturnType<typeof bookmarksSlice.reducer> }} WithBookmarks */

export const {
  selectAll: selectAllBookmarks,
  selectById: selectBookmarkById,
  selectTotal: selectBookmarkCount,
} = bookmarksAdapter.getSelectors((/** @type {WithBookmarks} */ state) => state.bookmarks);

/**
 * @param {WithBookmarks} state
 * @param {string} storyId
 */
export const selectIsBookmarked = (state, storyId) => Boolean(state.bookmarks.entities[storyId]);
