/**
 * Who is signed in on this device: the user's public profile (id, name,
 * picture), never a token. It picks whose saved data to show, so it lives
 * apart from that data.
 *
 * @typedef {{ id: string, name: string, avatarUrl: string|null }} AccountUser
 */

export const SESSION_KEY = 'feedolio:session';

/** @param {unknown} value @returns {value is AccountUser} */
export function isAccountUser(value) {
  const user = /** @type {Record<string, unknown>} */ (value);
  return (
    typeof user === 'object' &&
    user !== null &&
    typeof user.id === 'string' &&
    user.id.length > 0 &&
    typeof user.name === 'string' &&
    (user.avatarUrl === null || typeof user.avatarUrl === 'string')
  );
}

/** @returns {AccountUser|null} */
export function readSession() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? 'null');
    return isAccountUser(value) ? value : null;
  } catch {
    return null;
  }
}

/** @param {AccountUser|null} user */
export function writeSession(user) {
  try {
    if (user) globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(user));
    else globalThis.localStorage?.removeItem(SESSION_KEY);
  } catch {
    // Storage is blocked: the session lasts until the page closes.
  }
}
