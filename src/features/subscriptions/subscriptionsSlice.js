import { createEntityAdapter, createSelector, createSlice } from '@reduxjs/toolkit';
import { starterSubscriptions } from './defaults.js';

/**
 * A feed the reader follows.
 *
 * @typedef {Object} Subscription
 * @property {string}  id         Stable short hash of the normalised URL, e.g. "f_k3x9q2"
 * @property {string}  url        Feed URL, as it is fetched
 * @property {string}  title      Shown in the sidebar and on every story
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
  // Adding, hiding and removing feeds arrives in M5.
  initialState: subscriptionsAdapter.setAll(
    subscriptionsAdapter.getInitialState(),
    starterSubscriptions(),
  ),
  reducers: {},
});

export default subscriptionsSlice.reducer;

/**
 * The subscriptions slice from saved data. Starts with the starter feeds when
 * nothing was saved yet.
 *
 * @param {Subscription[]|undefined} saved
 */
export function restoreSubscriptions(saved) {
  return subscriptionsAdapter.setAll(
    subscriptionsAdapter.getInitialState(),
    saved ?? starterSubscriptions(),
  );
}

/** @typedef {{ subscriptions: ReturnType<typeof subscriptionsSlice.reducer> }} WithSubscriptions */

export const { selectAll: selectAllSubscriptions, selectById: selectSubscriptionById } =
  subscriptionsAdapter.getSelectors(
    (/** @type {WithSubscriptions} */ state) => state.subscriptions,
  );

/** Feeds shown in All stories and Today. */
export const selectEnabledSubscriptions = createSelector(
  [selectAllSubscriptions],
  (subscriptions) => subscriptions.filter((subscription) => subscription.enabled),
);
