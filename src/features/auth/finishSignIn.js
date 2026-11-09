import { toastShown } from '../../app/toastSlice.js';
import { getAuthClient } from './authClient.js';
import { signInStopped } from './authSlice.js';

/**
 * What Feedolio keeps from Auth0's profile: who it is, a name and a picture.
 *
 * @param {import('@auth0/auth0-spa-js').User} profile
 * @returns {import('./session.js').AccountUser}
 */
function accountUser(profile) {
  return {
    id: /** @type {string} */ (profile.sub),
    name: profile.name || profile.nickname || 'GitHub reader',
    avatarUrl: typeof profile.picture === 'string' ? profile.picture : null,
  };
}

/**
 * Where to go after signing in: back where the reader started, if that was a
 * page of this app.
 *
 * @param {unknown} path
 */
function returnPath(path) {
  return typeof path === 'string' && /^\/(?!\/)/.test(path) ? path : '/';
}

/**
 * Completes a sign-in after Auth0 sends the reader back: swaps the code for
 * the user's profile, switches to their saved data and returns them to where
 * they started. Loaded only when a sign-in is being finished.
 *
 * @param {{
 *   store: import('../../app/store.js').AppStore,
 *   navigate: import('react-router').NavigateFunction,
 *   params: URLSearchParams,
 *   pathname: string,
 * }} context
 */
export async function finishSignIn({ store, navigate, params, pathname }) {
  const client = await getAuthClient();
  if (!client) return;
  try {
    const { appState } = await client.handleRedirectCallback();
    const profile = await client.getUser();
    if (!profile?.sub) throw new Error('Auth0 returned no user');
    const user = accountUser(profile);
    store.switchAccount(user);
    navigate(returnPath(appState?.returnTo), { replace: true });
    store.dispatch(toastShown({ message: `Signed in as ${user.name}` }));
  } catch {
    store.dispatch(signInStopped());
    store.dispatch(
      toastShown({
        message:
          params.get('error') === 'access_denied'
            ? 'Sign-in was cancelled.'
            : 'Sign-in didn’t work. Try again in a moment.',
        tone: 'warning',
      }),
    );
    navigate(pathname, { replace: true });
  }
}
