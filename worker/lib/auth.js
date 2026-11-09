import { errorResponse, JSON_HEADERS } from './responses.js';

/**
 * Sign in with GitHub: an OAuth app's web flow, run here because GitHub's
 * token exchange needs the app's client secret and doesn't accept requests
 * from browsers.
 *
 * Feedolio keeps no GitHub token. The callback reads the reader's public
 * profile once, revokes the token, and hands the profile to the app in a
 * short-lived signed cookie that the app collects once. From then on the app
 * remembers who is signed in, on the device, only to keep each reader's saved
 * data apart.
 *
 * Settings: GITHUB_CLIENT_ID (a var) and GITHUB_CLIENT_SECRET (a secret).
 * Without both, sign-in is off.
 *
 * @typedef {{ GITHUB_CLIENT_ID?: string, GITHUB_CLIENT_SECRET?: string }} AuthEnv
 * @typedef {{ waitUntil(promise: Promise<unknown>): void }} WaitUntil
 * @typedef {{ id: string, name: string, avatarUrl: string|null }} AccountUser
 * @typedef {(request: Request, env: AuthEnv, ctx?: WaitUntil) => Promise<Response>|Response} Route
 */

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API_URL = 'https://api.github.com';
/** GitHub's REST API asks every client to name itself. */
const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'Feedolio',
};
/** Each call to GitHub gets this long. */
const GITHUB_TIMEOUT_MS = 8000;

/** While the reader is at GitHub: the state, the PKCE verifier and where to return. */
const OAUTH_COOKIE = '__Host-feedolio-oauth';
/** GitHub's codes last 10 minutes, so the wait for one does too. */
const OAUTH_SECONDS = 600;
/** The signed profile, from the callback until the app collects it. */
const HANDOFF_COOKIE = '__Host-feedolio-signin';
const HANDOFF_SECONDS = 120;

/** Where the reader may be sent back to: a path in this app, nothing else. */
const RETURN_PATH = /^\/(?![/\\])[\w\-.~!$&'()*+,;=:@%/]*$/;

const encoder = new TextEncoder();

/** @type {Map<string, { method: string, handle: Route }>} */
const ROUTES = new Map([
  ['/api/auth/config', { method: 'GET', handle: config }],
  ['/api/auth/login', { method: 'GET', handle: login }],
  ['/api/auth/callback', { method: 'GET', handle: callback }],
  ['/api/auth/session', { method: 'POST', handle: session }],
]);

/**
 * Handles /api/auth/*.
 *
 * @param {Request} request
 * @param {AuthEnv} env
 * @param {WaitUntil} [ctx]
 * @returns {Promise<Response>}
 */
export async function handleAuthRequest(request, env, ctx) {
  const { pathname } = new URL(request.url);
  const route = ROUTES.get(pathname);
  if (!route) return errorResponse(404, 'NOT_FOUND', 'There is no API at this address.');
  if (request.method !== route.method) {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', `Use ${route.method} for ${pathname}.`, {
      headers: { Allow: route.method },
    });
  }
  return route.handle(request, env ?? {}, ctx);
}

/**
 * A path in this app to return to, or "/".
 *
 * @param {unknown} value
 * @returns {string}
 */
export function returnPath(value) {
  return typeof value === 'string' && value.length <= 512 && RETURN_PATH.test(value) ? value : '/';
}

/**
 * GET /api/auth/config: whether this copy offers sign-in. The same for
 * everyone, so the edge keeps it for a minute.
 *
 * @type {Route}
 */
function config(_request, env) {
  return new Response(JSON.stringify({ signIn: isOn(env) }), {
    headers: {
      ...JSON_HEADERS,
      'Cache-Control': 'no-cache',
      'Cloudflare-CDN-Cache-Control': 'max-age=60',
    },
  });
}

/**
 * GET /api/auth/login?returnTo=/path: off to GitHub, with a fresh state (so
 * nobody else can finish this sign-in) and PKCE (so a stolen code is useless).
 *
 * @type {Route}
 */
async function login(request, env) {
  const url = new URL(request.url);
  const returnTo = returnPath(url.searchParams.get('returnTo'));
  if (!isOn(env)) return redirect(withOutcome(returnTo, 'off'), []);

  const state = randomText(16);
  const verifier = randomText(32);
  const authorize = new URL(AUTHORIZE_URL);
  authorize.search = new URLSearchParams({
    client_id: /** @type {string} */ (env.GITHUB_CLIENT_ID),
    redirect_uri: callbackUrl(url),
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
    // GitHub's account picker every time, so on a shared browser the next
    // reader isn't signed in as the last one without being asked.
    prompt: 'select_account',
  }).toString();
  // No scope: public profile only.
  const waiting = `${state}.${verifier}.${encodeText(returnTo)}`;
  return redirect(authorize.href, [cookie(OAUTH_COOKIE, waiting, OAUTH_SECONDS, 'Lax')]);
}

/**
 * GET /api/auth/callback?code=…&state=… (or ?error=…): GitHub sends the reader
 * back here. Swaps the code for a token, reads the public profile, revokes the
 * token, and returns the reader to the app with the profile in a signed cookie.
 *
 * @type {Route}
 */
async function callback(request, env, ctx) {
  const url = new URL(request.url);
  const waiting = readWaiting(request);
  const returnTo = waiting?.returnTo ?? '/';
  /** @param {string} outcome @param {string[]} [cookies] */
  const back = (outcome, cookies = []) =>
    redirect(withOutcome(returnTo, outcome), [cookie(OAUTH_COOKIE, '', 0, 'Lax'), ...cookies]);

  if (!isOn(env)) return back('off');
  // No cookie means it expired, or this sign-in didn't start in this browser.
  if (!waiting || !sameText(url.searchParams.get('state') ?? '', waiting.state)) {
    console.warn('sign-in: state missing or not matching');
    return back('failed');
  }
  const error = url.searchParams.get('error');
  if (error) return back(error === 'access_denied' ? 'cancelled' : 'failed');
  const code = url.searchParams.get('code');
  if (!code) return back('failed');

  try {
    const token = await exchange(code, waiting.verifier, callbackUrl(url), env);
    try {
      const user = await profile(token);
      const handoff = await seal({ user, exp: nowSeconds() + HANDOFF_SECONDS }, env);
      return back('ok', [cookie(HANDOFF_COOKIE, handoff, HANDOFF_SECONDS, 'Strict')]);
    } finally {
      const revoking = revoke(token, env);
      if (ctx) ctx.waitUntil(revoking);
      else await revoking;
    }
  } catch (problem) {
    // GitHub's own error codes (e.g. redirect_uri_mismatch) help with setup;
    // nothing secret is logged.
    console.warn('sign-in:', problem instanceof Error ? problem.message : 'failed');
    return back('failed');
  }
}

/**
 * POST /api/auth/session: the app collects the signed profile, once.
 *
 * @type {Route}
 */
async function session(request, env) {
  const clear = { 'Set-Cookie': cookie(HANDOFF_COOKIE, '', 0, 'Strict') };
  if (!sameOrigin(request)) {
    return errorResponse(403, 'FORBIDDEN', 'Only Feedolio can finish its own sign-in.', {
      headers: clear,
    });
  }
  const sealed = cookiesOf(request).get(HANDOFF_COOKIE);
  const data = sealed && isOn(env) ? await unseal(sealed, env) : null;
  if (!data || !(Number(data.exp) > nowSeconds()) || !isUser(data.user)) {
    return errorResponse(401, 'NOT_SIGNED_IN', 'There’s no sign-in to finish. Try again.', {
      headers: clear,
    });
  }
  return new Response(JSON.stringify({ user: data.user }), {
    headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store', ...clear },
  });
}

/**
 * Swaps GitHub's code for an access token.
 *
 * @param {string} code
 * @param {string} verifier
 * @param {string} redirectUri
 * @param {AuthEnv} env
 */
async function exchange(code, verifier, redirectUri, env) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Feedolio',
    },
    body: new URLSearchParams({
      client_id: /** @type {string} */ (env.GITHUB_CLIENT_ID),
      client_secret: /** @type {string} */ (env.GITHUB_CLIENT_SECRET),
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);
  // A bad code or setting comes back as 200 with { error }.
  if (!response.ok || typeof body?.access_token !== 'string') {
    throw new Error(`no token from GitHub (${body?.error ?? response.status})`);
  }
  return /** @type {string} */ (body.access_token);
}

/**
 * The reader's public GitHub profile, as Feedolio keeps it.
 *
 * @param {string} token
 * @returns {Promise<AccountUser>}
 */
async function profile(token) {
  const response = await fetch(`${API_URL}/user`, {
    headers: { ...API_HEADERS, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`no profile from GitHub (${response.status})`);
  const body = await response.json();
  if (!Number.isSafeInteger(body?.id) || typeof body.login !== 'string' || !body.login) {
    throw new Error('no profile from GitHub (unexpected answer)');
  }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : body.login;
  return {
    id: `github|${body.id}`,
    name: name.slice(0, 100),
    avatarUrl:
      typeof body.avatar_url === 'string' && body.avatar_url.startsWith('https://')
        ? body.avatar_url
        : null,
  };
}

/**
 * Revokes the token once the profile is read, so no live token is left
 * anywhere. The reader's approval of Feedolio stays, so signing in again is
 * quick. Never throws.
 *
 * @param {string} token
 * @param {AuthEnv} env
 */
async function revoke(token, env) {
  const id = /** @type {string} */ (env.GITHUB_CLIENT_ID);
  const secret = /** @type {string} */ (env.GITHUB_CLIENT_SECRET);
  try {
    const response = await fetch(`${API_URL}/applications/${encodeURIComponent(id)}/token`, {
      method: 'DELETE',
      headers: {
        ...API_HEADERS,
        Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: token }),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    if (!response.ok) console.warn(`sign-in: token not revoked (${response.status})`);
  } catch {
    console.warn('sign-in: token not revoked');
  }
}

/** @param {AuthEnv} env */
function isOn(env) {
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

/** @param {URL} url */
function callbackUrl(url) {
  return `${url.origin}/api/auth/callback`;
}

/** @param {string} path @param {string} outcome */
function withOutcome(path, outcome) {
  return `${path}?signin=${outcome}`;
}

/**
 * The browser's own requests say where they come from; anything else (no
 * header at all) can't carry the reader's cookie across sites anyway.
 *
 * @param {Request} request
 */
function sameOrigin(request) {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site) return site === 'same-origin';
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

/**
 * @param {string} location
 * @param {string[]} cookies
 */
function redirect(location, cookies) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 302, headers });
}

/**
 * A cookie only this Worker can read: never sent over plain http (except to
 * localhost), never shared with other sites' subdomains, out of reach of the
 * page's scripts.
 *
 * @param {string} name
 * @param {string} value
 * @param {number} seconds  0 deletes it
 * @param {'Lax'|'Strict'} sameSite
 */
function cookie(name, value, seconds, sameSite) {
  return `${name}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=${sameSite}`;
}

/** @param {Request} request */
function cookiesOf(request) {
  /** @type {Map<string, string>} */
  const cookies = new Map();
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) cookies.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  return cookies;
}

/**
 * The sign-in this browser started, from its cookie.
 *
 * @param {Request} request
 * @returns {{ state: string, verifier: string, returnTo: string } | null}
 */
function readWaiting(request) {
  const [state, verifier, returnTo, ...rest] =
    cookiesOf(request).get(OAUTH_COOKIE)?.split('.') ?? [];
  if (!state || !verifier || !returnTo || rest.length > 0) return null;
  try {
    return { state, verifier, returnTo: returnPath(decodeText(returnTo)) };
  } catch {
    return null;
  }
}

/**
 * Signs data with a key derived from the client secret, so only this Worker
 * can make a handoff it will accept.
 *
 * @param {unknown} data
 * @param {AuthEnv} env
 */
async function seal(data, env) {
  const payload = encodeText(JSON.stringify(data));
  const signature = await crypto.subtle.sign('HMAC', await keyFor(env), encoder.encode(payload));
  return `${payload}.${encodeBytes(new Uint8Array(signature))}`;
}

/**
 * The data from a sealed handoff, or null if it isn't one of ours.
 *
 * @param {string} sealed
 * @param {AuthEnv} env
 * @returns {Promise<{ user?: unknown, exp?: unknown } | null>}
 */
async function unseal(sealed, env) {
  const [payload, signature, ...rest] = sealed.split('.');
  if (!payload || !signature || rest.length > 0) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await keyFor(env),
      decodeBytes(signature),
      encoder.encode(payload),
    );
    return valid ? JSON.parse(decodeText(payload)) : null;
  } catch {
    return null;
  }
}

/**
 * An HMAC key for handoffs, derived from the client secret (HKDF), so there's
 * one secret to set rather than two.
 *
 * @param {AuthEnv} env
 */
async function keyFor(env) {
  const secret = await crypto.subtle.importKey(
    'raw',
    encoder.encode(/** @type {string} */ (env.GITHUB_CLIENT_SECRET)),
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('feedolio'),
      info: encoder.encode('sign-in handoff v1'),
    },
    secret,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify'],
  );
}

/** @param {unknown} value @returns {value is AccountUser} */
function isUser(value) {
  const user = /** @type {Record<string, unknown>} */ (value);
  return (
    typeof user === 'object' &&
    user !== null &&
    typeof user.id === 'string' &&
    user.id.startsWith('github|') &&
    typeof user.name === 'string' &&
    (user.avatarUrl === null || typeof user.avatarUrl === 'string')
  );
}

/** @param {string} verifier  PKCE's S256: the verifier's SHA-256, base64url */
async function challengeFor(verifier) {
  return encodeBytes(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))),
  );
}

/** Two strings compared in constant time. @param {string} a @param {string} b */
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/** @param {number} bytes */
function randomText(bytes) {
  return encodeBytes(crypto.getRandomValues(new Uint8Array(bytes)));
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

/** @param {Uint8Array} bytes  as base64url */
function encodeBytes(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** @param {string} text  base64url */
function decodeBytes(text) {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** @param {string} text */
function encodeText(text) {
  return encodeBytes(encoder.encode(text));
}

/** @param {string} text */
function decodeText(text) {
  return new TextDecoder().decode(decodeBytes(text));
}
