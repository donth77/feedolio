import { useSyncExternalStore } from 'react';

/** Whether this copy of Feedolio offers sign-in; null until the Worker says. */
let available = /** @type {boolean|null} */ (null);
let asked = false;
/** @type {Set<() => void>} */
const listeners = new Set();

/** Asks the Worker once per page: sign-in needs its GitHub settings. */
function ask() {
  if (asked) return;
  asked = true;
  fetch('/api/auth/config', { headers: { Accept: 'application/json' } })
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => body?.signIn === true)
    .catch(() => false)
    .then((answer) => {
      available = answer;
      for (const listener of listeners) listener();
    });
}

/** @param {() => void} listener */
function subscribe(listener) {
  listeners.add(listener);
  ask();
  return () => listeners.delete(listener);
}

/**
 * Whether sign-in is offered here: null while asking, then true or false.
 *
 * @returns {boolean|null}
 */
export function useSignInAvailable() {
  return useSyncExternalStore(
    subscribe,
    () => available,
    () => null,
  );
}

/** Forgets the answer, so tests can start from scratch. */
export function resetSignInStatus() {
  available = null;
  asked = false;
}
