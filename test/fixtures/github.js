import { http, HttpResponse } from 'msw';

/**
 * GitHub's side of sign-in, faked at the network the way GitHub's docs
 * describe it: the token exchange checks the app's credentials, the code
 * (single use), the callback address and the PKCE verifier; the profile needs
 * a live token; revoking needs the app's credentials. The authorize page is a
 * helper, because the reader would be on github.com.
 *
 * @typedef {{ id: number, login: string, name: string|null, avatarUrl?: string }} GitHubUser
 */

/** The OAuth app the tests' Worker is set up with. */
export const GITHUB_APP = { clientId: 'test-client-id', clientSecret: 'test-client-secret' };

/** Sign-in settings for the Worker: a var and a secret. */
export const GITHUB_ENV = {
  GITHUB_CLIENT_ID: GITHUB_APP.clientId,
  GITHUB_CLIENT_SECRET: GITHUB_APP.clientSecret,
};

/** @type {Map<string, { user: GitHubUser, challenge: string|null, redirectUri: string|null }>} */
const codes = new Map();
/** Issued and not yet revoked. @type {Map<string, GitHubUser>} */
const tokens = new Map();
let issued = 0;

/**
 * The reader approves Feedolio on GitHub; returns where GitHub sends them.
 *
 * @param {string} authorizeUrl  Where the Worker sent the reader
 * @param {GitHubUser} user
 */
export function approveOnGitHub(authorizeUrl, user) {
  const params = new URL(authorizeUrl).searchParams;
  issued += 1;
  const code = `code-${issued}`;
  codes.set(code, {
    user,
    challenge: params.get('code_challenge'),
    redirectUri: params.get('redirect_uri'),
  });
  return backTo(params, { code, state: params.get('state') ?? '' });
}

/**
 * The reader says no on GitHub.
 *
 * @param {string} authorizeUrl
 */
export function denyOnGitHub(authorizeUrl) {
  const params = new URL(authorizeUrl).searchParams;
  return backTo(params, {
    error: 'access_denied',
    error_description: 'The user has denied your application access.',
    state: params.get('state') ?? '',
  });
}

/** Tokens GitHub issued that are still live. */
export function liveTokens() {
  return [...tokens.keys()];
}

export function resetGitHub() {
  codes.clear();
  tokens.clear();
}

/**
 * @param {URLSearchParams} params
 * @param {Record<string, string>} query
 */
function backTo(params, query) {
  const back = new URL(/** @type {string} */ (params.get('redirect_uri')));
  back.search = new URLSearchParams(query).toString();
  return back.href;
}

/** @param {string} verifier */
async function s256(verifier) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  );
  return btoa(String.fromCharCode(...digest))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

/** GitHub answers token errors with 200 and a JSON body. @param {string} error */
const tokenError = (error) => HttpResponse.json({ error, error_description: error });

export const githubHandlers = [
  http.post('https://github.com/login/oauth/access_token', async ({ request }) => {
    const form = new URLSearchParams(await request.text());
    if (
      form.get('client_id') !== GITHUB_APP.clientId ||
      form.get('client_secret') !== GITHUB_APP.clientSecret
    ) {
      return tokenError('incorrect_client_credentials');
    }
    const code = form.get('code') ?? '';
    const grant = codes.get(code);
    codes.delete(code);
    if (!grant) return tokenError('bad_verification_code');
    if (form.get('redirect_uri') !== grant.redirectUri) return tokenError('redirect_uri_mismatch');
    if ((await s256(form.get('code_verifier') ?? '')) !== grant.challenge) {
      return tokenError('bad_verification_code');
    }
    const token = `gho_test_${code}`;
    tokens.set(token, grant.user);
    return HttpResponse.json({ access_token: token, token_type: 'bearer', scope: '' });
  }),

  http.get('https://api.github.com/user', ({ request }) => {
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
    const user = tokens.get(token);
    if (!user) return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 });
    return HttpResponse.json({
      id: user.id,
      login: user.login,
      name: user.name,
      avatar_url: user.avatarUrl ?? `https://avatars.githubusercontent.com/u/${user.id}?v=4`,
    });
  }),

  http.delete(
    'https://api.github.com/applications/:clientId/token',
    async ({ request, params }) => {
      const app = `Basic ${btoa(`${GITHUB_APP.clientId}:${GITHUB_APP.clientSecret}`)}`;
      if (params.clientId !== GITHUB_APP.clientId || request.headers.get('Authorization') !== app) {
        return HttpResponse.json({ message: 'Not Found' }, { status: 404 });
      }
      const { access_token: token } = await request.json();
      tokens.delete(token);
      return new HttpResponse(null, { status: 204 });
    },
  ),
];
