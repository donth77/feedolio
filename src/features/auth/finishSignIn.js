import { toastShown } from '../../app/toastSlice.js';
import { isAccountUser } from './session.js';

/** What the reader is told when a sign-in comes back without them signed in. */
const OUTCOMES = {
  cancelled: 'Sign-in was cancelled.',
  off: 'Sign-in isn’t set up on this copy of Feedolio.',
  failed: 'Sign-in didn’t work. Try again in a moment.',
};

/**
 * Completes a sign-in after the Worker brings the reader back from GitHub with
 * ?signin=ok (or cancelled, off, failed): collects the profile the Worker
 * signed, switches to the reader's saved data and tidies the address. Loaded
 * only when a sign-in is being finished.
 *
 * @param {{
 *   store: import('../../app/store.js').AppStore,
 *   navigate: import('react-router').NavigateFunction,
 *   params: URLSearchParams,
 *   pathname: string,
 * }} context
 */
export async function finishSignIn({ store, navigate, params, pathname }) {
  const outcome = params.get('signin');
  const rest = new URLSearchParams(params);
  rest.delete('signin');
  const here = rest.size > 0 ? `${pathname}?${rest}` : pathname;

  if (outcome === 'ok') {
    const user = await collectProfile();
    if (user) {
      store.switchAccount(user);
      navigate(here, { replace: true });
      store.dispatch(toastShown({ message: `Signed in as ${user.name}` }));
      return;
    }
  }
  navigate(here, { replace: true });
  store.dispatch(
    toastShown({
      message: outcome === 'cancelled' || outcome === 'off' ? OUTCOMES[outcome] : OUTCOMES.failed,
      tone: 'warning',
    }),
  );
}

/**
 * The profile the Worker left for this browser, collected once.
 *
 * @returns {Promise<import('./session.js').AccountUser|null>}
 */
async function collectProfile() {
  try {
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    const body = response.ok ? await response.json() : null;
    return isAccountUser(body?.user) ? body.user : null;
  } catch {
    return null;
  }
}
