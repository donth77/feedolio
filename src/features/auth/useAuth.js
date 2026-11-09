import { useCallback } from 'react';
import { useStore } from 'react-redux';
import { useLocation } from 'react-router';

/** @typedef {import('../../app/store.js').AppStore} AppStore */

/**
 * Where "Sign in with GitHub" goes: the Worker, which sends the reader to
 * GitHub and back to this page.
 *
 * @param {string} pathname
 */
export function signInHref(pathname) {
  return `/api/auth/login?returnTo=${encodeURIComponent(pathname)}`;
}

/** Sign in with GitHub, and sign out. */
export function useAuthActions() {
  const store = /** @type {AppStore} */ (useStore());
  const { pathname } = useLocation();

  // Signing out is local: the Worker keeps no session or GitHub token.
  const signOut = useCallback(() => store.switchAccount(null), [store]);

  return { signInHref: signInHref(pathname), signOut };
}
