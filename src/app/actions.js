import { createAction } from '@reduxjs/toolkit';

/**
 * Saved data was replaced from outside this tab: another tab saved, or (from
 * M9) the reader switched accounts. Each saved slice rebuilds itself from the
 * payload, which is what loadSaved() returns.
 */
export const persistedStateHydrated = createAction(
  'app/persistedStateHydrated',
  (/** @type {import('./persistence.js').SavedData} */ saved) => ({ payload: saved }),
);
