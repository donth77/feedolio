import { createEntityAdapter, createSlice } from '@reduxjs/toolkit';

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
  reducers: {},
});

export default bookmarksSlice.reducer;
