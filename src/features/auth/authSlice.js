import { createSlice } from '@reduxjs/toolkit';

/**
 * Optional GitHub sign-in (M9). Signing in only keeps each reader's data
 * apart on this device; nothing syncs.
 *
 * @typedef {Object} AuthState
 * @property {'signedOut'|'signingIn'|'signedIn'} status
 * @property {{ id: string, name: string, avatarUrl: string|null }|null} user
 */

/** @type {AuthState} */
const initialState = {
  status: 'signedOut',
  user: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {},
});

export default authSlice.reducer;
