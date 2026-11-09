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
