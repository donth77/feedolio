import { createEntityAdapter, createSlice } from '@reduxjs/toolkit';

/**
 * A feed the reader follows.
 *
 * @typedef {Object} Subscription
 * @property {string}  id         Stable short hash of the normalised URL, e.g. "f_k3x9q2"
 * @property {string}  url        Normalised feed URL
 * @property {string}  title      From the feed
 * @property {boolean} enabled    Included in "All stories"
 * @property {boolean} isDefault  One of the starter feeds
 * @property {string}  addedAt    ISO timestamp
 */

/** Oldest first, so the sidebar keeps the order feeds were added in. */
const subscriptionsAdapter = createEntityAdapter({
  /** @type {(a: Subscription, b: Subscription) => number} */
  sortComparer: (a, b) => a.addedAt.localeCompare(b.addedAt),
});

const subscriptionsSlice = createSlice({
  name: 'subscriptions',
  initialState: subscriptionsAdapter.getInitialState(),
  reducers: {},
});

export default subscriptionsSlice.reducer;
