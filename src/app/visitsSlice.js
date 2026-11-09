import { createSlice } from '@reduxjs/toolkit';

/**
 * When the reader was last here. Drives the "New since your last visit"
 * divider and, later, the "Catch me up" window.
 *
 * @typedef {Object} Visits
 * @property {string|null} lastVisitAt    ISO; the value read at start-up is this session's cut-off
 * @property {string|null} lastCatchUpAt  ISO; start of the next "Catch me up" window
 * @property {string[]}    openedIds      Most recent 2,000 opened story ids
 * @property {string|null} cutoff         This session's divider cut-off; not persisted
 */

/** @type {Visits} */
const initialState = {
  lastVisitAt: null,
  lastCatchUpAt: null,
  openedIds: [],
  cutoff: null,
};

const visitsSlice = createSlice({
  name: 'visits',
  initialState,
  reducers: {},
});

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
  };
}
