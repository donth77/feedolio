import { createSlice } from '@reduxjs/toolkit';
import { persistedStateHydrated } from './actions.js';

/**
 * When the reader was last here. Drives the "New since your last visit"
 * divider, the first-visit welcome note and, later, the "Catch me up" window.
 *
 * @typedef {Object} Visits
 * @property {string|null} lastVisitAt       ISO; moves forward whenever the reader leaves the page
 * @property {string|null} lastCatchUpAt     ISO; start of the next "Catch me up" window
 * @property {string[]}    openedIds         Most recent 2,000 opened story ids
 * @property {string|null} cutoff            The last visit before this session began: the divider's
 *                                           place. Null on a first visit. Not saved.
 * @property {boolean}     welcomeDismissed  The reader closed the welcome note. Not saved.
 */

/** @type {Visits} */
const initialState = {
  lastVisitAt: null,
  lastCatchUpAt: null,
  openedIds: [],
  cutoff: null,
  welcomeDismissed: false,
};

const visitsSlice = createSlice({
  name: 'visits',
  initialState,
  reducers: {
    /**
     * The reader left the page (closed it, or switched away). The next session's
     * divider goes here; this session's stays where it was.
     */
    visitEnded: {
      reducer(state, /** @type {{ payload: string }} */ { payload }) {
        state.lastVisitAt = payload;
      },
      prepare: () => ({ payload: new Date().toISOString() }),
    },
    welcomeDismissed(state) {
      state.welcomeDismissed = true;
    },
  },
  extraReducers: (builder) => {
    // Another tab's record replaces ours, but this session keeps its own cut-off.
    builder.addCase(persistedStateHydrated, (state, { payload }) => ({
      ...restoreVisits(payload.visits),
      cutoff: state.cutoff,
      welcomeDismissed: state.welcomeDismissed,
    }));
  },
});

export const { visitEnded, welcomeDismissed } = visitsSlice.actions;
export default visitsSlice.reducer;

/**
 * The visit record from saved data. This session's cut-off starts as the last
 * visit before it.
 *
 * @param {Record<string, unknown>} [saved]
 * @returns {Visits}
 */
export function restoreVisits(saved = {}) {
  const isoOrNull = (/** @type {unknown} */ value) =>
    typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
  const lastVisitAt = isoOrNull(saved.lastVisitAt);
  return {
    lastVisitAt,
    lastCatchUpAt: isoOrNull(saved.lastCatchUpAt),
    openedIds: Array.isArray(saved.openedIds)
      ? saved.openedIds.filter((id) => typeof id === 'string').slice(-2000)
      : [],
    cutoff: lastVisitAt,
    welcomeDismissed: false,
  };
}

/** @typedef {{ visits: Visits }} WithVisits */

/** Where this session's "New since your last visit" divider goes. @param {WithVisits} state */
export const selectCutoff = (state) => state.visits.cutoff;

/** A first visit that hasn't dismissed the welcome note. @param {WithVisits} state */
export const selectShowWelcome = (state) =>
  state.visits.cutoff === null && !state.visits.welcomeDismissed;
