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

/**
 * In the reader's order: new feeds go last, and feeds can be dragged or moved
 * (feedMoved). The sidebar, the phone chips and Settings all follow it.
 */
const subscriptionsAdapter = createEntityAdapter();

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
    /** Puts back a removed feed as it was, where it was (Undo). */
    subscriptionRestored: {
      reducer(
        state,
        /** @type {{ payload: { subscription: Subscription, index: number } }} */ { payload },
      ) {
        subscriptionsAdapter.upsertOne(state, payload.subscription);
        moveId(state.ids, payload.subscription.id, payload.index);
      },
      /** @param {Subscription} subscription @param {number} index  Where it was */
      prepare: (subscription, index) => ({ payload: { subscription, index } }),
    },
    /** Moves a feed to another place in the reader's order. */
    feedMoved(state, /** @type {{ payload: { id: string, to: number } }} */ { payload }) {
      moveId(state.ids, payload.id, payload.to);
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
  feedMoved,
} = subscriptionsSlice.actions;
export default subscriptionsSlice.reducer;

/**
 * Moves an id to a new index (clamped to the list), in place.
 *
 * @param {string[]} ids
 * @param {string} id
 * @param {number} to
 */
function moveId(ids, id, to) {
  const from = ids.indexOf(id);
  if (from === -1) return;
  ids.splice(from, 1);
  ids.splice(Math.max(0, Math.min(Math.trunc(to) || 0, ids.length)), 0, id);
}

/**
 * The subscriptions slice from saved data, in the order it was saved. Starts
 * with the starter feeds when nothing was saved yet.
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
