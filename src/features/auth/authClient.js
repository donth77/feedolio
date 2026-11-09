import { authConfig } from './authConfig.js';

/** @type {Promise<import('@auth0/auth0-spa-js').Auth0Client> | null} */
let client = null;

/**
 * Auth0's client, loaded the first time it's needed, so readers who never
 * sign in never download it. Null when sign-in isn't set up.
 *
 * Tokens stay in memory: Feedolio only needs to know who signed in, to keep
 * their saved data apart, and calls no API with them.
 */
export async function getAuthClient() {
  const config = authConfig();
  if (!config) return null;
  client ??= import('@auth0/auth0-spa-js').then(
    ({ Auth0Client }) =>
      new Auth0Client({
        domain: config.domain,
        clientId: config.clientId,
        authorizationParams: { redirect_uri: window.location.origin },
        cacheLocation: 'memory',
      }),
  );
  return client;
}

/** Forgets the client, so tests can start from scratch. */
export function resetAuthClient() {
  client = null;
}
