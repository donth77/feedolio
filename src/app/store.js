import { configureStore } from '@reduxjs/toolkit';
import auth from '../features/auth/authSlice.js';
import bookmarks from '../features/bookmarks/bookmarksSlice.js';
import preferences from '../features/preferences/preferencesSlice.js';
import subscriptions from '../features/subscriptions/subscriptionsSlice.js';
import visits from './visitsSlice.js';

/**
 * Builds a fresh store. Persistence (M4) will pass the saved state in here.
 *
 * @param {Partial<RootState>} [preloadedState]
 */
export function makeStore(preloadedState) {
  return configureStore({
    reducer: { subscriptions, bookmarks, preferences, visits, auth },
    preloadedState,
  });
}

/** @typedef {ReturnType<typeof makeStore>} AppStore */
/** @typedef {ReturnType<AppStore['getState']>} RootState */
