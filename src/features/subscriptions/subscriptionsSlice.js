import { createEntityAdapter, createSelector, createSlice } from '@reduxjs/toolkit';
import { persistedStateHydrated } from '../../app/actions.js';
import { feedIdFor, normaliseFeedUrl } from '../../lib/url.js';
import { STARTER_FEEDS, starterSubscriptions } from './defaults.js';

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

const STARTER_URLS = new Set(STARTER_FEEDS.map(({ url }) => normaliseFeedUrl(url)));

const subscriptionsSlice = createSlice({
  name: 'subscriptions',
  initialState: subscriptionsAdapter.setAll(
    subscriptionsAdapter.getInitialState(),
    starterSubscriptions(),
  ),
  reducers: {
    /** Follows a feed. Adding one that's already followed changes nothing. */
    subscriptionAdded: {
      reducer(state, /** @type {{ payload: Subscription }} */ { payload }) {
        if (!state.entities[payload.id]) subscriptionsAdapter.addOne(state, payload);
      },
      /** @param {{ url: string, title: string }} feed */
      prepare: ({ url, title }) => ({
        payload: {
          id: feedIdFor(url),
          url,
          title,
          enabled: true,
          isDefault: STARTER_URLS.has(normaliseFeedUrl(url)),
          addedAt: new Date().toISOString(),
        },
      }),
    },
    /** @param {{ payload: string }} action  The feed id */
    subscriptionRemoved(state, { payload }) {
      subscriptionsAdapter.removeOne(state, payload);
    },
    /** Puts back a removed feed as it was (Undo). */
    subscriptionRestored(state, /** @type {{ payload: Subscription }} */ { payload }) {
      subscriptionsAdapter.upsertOne(state, payload);
    },
    /** Shows a feed in All stories and Today, or hides it from them. */
    subscriptionToggled(state, /** @type {{ payload: string }} */ { payload }) {
      const subscription = state.entities[payload];
      if (subscription) subscription.enabled = !subscription.enabled;
    },
    /** Brings back every starter feed, and shows any that were hidden. */
    defaultsRestored: {
      reducer(state, /** @type {{ payload: Subscription[] }} */ { payload }) {
        for (const starter of payload) {
          const existing = state.entities[starter.id];
          if (existing) existing.enabled = true;
          else subscriptionsAdapter.addOne(state, starter);
        }
      },
      prepare: () => ({ payload: starterSubscriptions() }),
    },
  },
  extraReducers: (builder) => {
    builder.addCase(persistedStateHydrated, (_state, { payload }) =>
      restoreSubscriptions(payload.subscriptions),
    );
  },
});

export const {
  subscriptionAdded,
  subscriptionRemoved,
  subscriptionRestored,
  subscriptionToggled,
  defaultsRestored,
} = subscriptionsSlice.actions;
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

export const {
  selectAll: selectAllSubscriptions,
  selectById: selectSubscriptionById,
  selectEntities: selectSubscriptionEntities,
} = subscriptionsAdapter.getSelectors(
  (/** @type {WithSubscriptions} */ state) => state.subscriptions,
);

/** Feeds shown in All stories and Today. */
export const selectEnabledSubscriptions = createSelector(
  [selectAllSubscriptions],
  (subscriptions) => subscriptions.filter((subscription) => subscription.enabled),
);

/**
 * The followed feed at this address, if any. Addresses are compared
 * normalised, so a trailing slash or different case doesn't count as new.
 *
 * @param {WithSubscriptions} state
 * @param {string} url
 */
export function selectSubscriptionByUrl(state, url) {
  try {
    return state.subscriptions.entities[feedIdFor(url)];
  } catch {
    return undefined;
  }
}

/** Starter feeds the reader doesn't follow, offered back in Settings. */
export const selectSuggestedFeeds = createSelector([selectSubscriptionEntities], (entities) =>
  STARTER_FEEDS.filter(({ url }) => !entities[feedIdFor(url)]),
);

/** Whether "Restore starter feeds" would change anything. */
export const selectCanRestoreDefaults = createSelector([selectSubscriptionEntities], (entities) =>
  STARTER_FEEDS.some(({ url }) => !entities[feedIdFor(url)]?.enabled),
);
