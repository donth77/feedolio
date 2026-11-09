/**
 * Auth0 settings, from the build's environment (see .env.example). Without
 * them, sign-in is off and everyone reads as a guest.
 *
 * @returns {{ domain: string, clientId: string } | null}
 */
export function authConfig() {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  return domain && clientId ? { domain, clientId } : null;
}
