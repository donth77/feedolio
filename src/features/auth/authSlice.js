import { createSlice } from '@reduxjs/toolkit';

/**
 * Optional GitHub sign-in. Signing in only keeps each reader's data apart on
 * this device; nothing syncs.
 *
 * @typedef {import('./session.js').AccountUser} AccountUser
 *
 * @typedef {Object} AuthState
 * @property {'signedOut'|'signingIn'|'signedIn'} status
 * @property {AccountUser|null} user
 * @property {number} guestBookmarks  Saved-while-signed-out stories offered to a new account; 0 when none
 */

/**
 * @param {AccountUser|null} user
 * @returns {AuthState}
 */
export function authStateFor(user) {
  return { status: user ? 'signedIn' : 'signedOut', user, guestBookmarks: 0 };
}

const authSlice = createSlice({
  name: 'auth',
  initialState: authStateFor(null),
  reducers: {
    signInStarted(state) {
      state.status = 'signingIn';
    },
    signInStopped(state) {
      state.status = state.user ? 'signedIn' : 'signedOut';
    },
    /** @param {{ payload: AccountUser }} action */
    signedIn: (_state, { payload }) => authStateFor(payload),
    signedOut: () => authStateFor(null),
    /** @param {{ payload: number }} action  How many guest bookmarks to offer */
    guestImportOffered(state, { payload }) {
      state.guestBookmarks = payload;
    },
    guestImportClosed(state) {
      state.guestBookmarks = 0;
    },
  },
});

export const {
  signInStarted,
  signInStopped,
  signedIn,
  signedOut,
  guestImportOffered,
  guestImportClosed,
} = authSlice.actions;
export default authSlice.reducer;

/** @param {{ auth: AuthState }} state */
export const selectAuth = (state) => state.auth;
