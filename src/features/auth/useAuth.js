import { useCallback } from 'react';
import { useDispatch, useStore } from 'react-redux';
import { useLocation } from 'react-router';
import { toastShown } from '../../app/toastSlice.js';
import { getAuthClient } from './authClient.js';
import { signInStarted, signInStopped } from './authSlice.js';

/** @typedef {import('../../app/store.js').AppStore} AppStore */

/** Sign in with GitHub (through Auth0), and sign out. */
export function useAuthActions() {
  const dispatch = useDispatch();
  const store = /** @type {AppStore} */ (useStore());
  const { pathname } = useLocation();

  const signIn = useCallback(async () => {
    const client = await getAuthClient();
    if (!client) return;
    dispatch(signInStarted());
    try {
      await client.loginWithRedirect({
        authorizationParams: { connection: 'github' },
        appState: { returnTo: pathname },
      });
    } catch {
      dispatch(signInStopped());
      dispatch(
        toastShown({
          message: 'Couldn’t reach the sign-in page. Try again in a moment.',
          tone: 'warning',
        }),
      );
    }
  }, [dispatch, pathname]);

  const signOut = useCallback(async () => {
    store.switchAccount(null);
    const client = await getAuthClient();
    // Ends the session at Auth0 too, so the next person has to sign in to GitHub again.
    await client?.logout({ logoutParams: { returnTo: window.location.origin } });
  }, [store]);

  return { signIn, signOut };
}
