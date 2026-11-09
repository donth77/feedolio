import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../worker/index.js';
import { fakeInternet } from './fakeInternet.js';

const ENV = { GITHUB_CLIENT_ID: 'test-client-id', GITHUB_CLIENT_SECRET: 'test-client-secret' };
const SITE = 'https://feedolio.test';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const REVOKE_URL = 'https://api.github.com/applications/test-client-id/token';
const OAUTH = '__Host-feedolio-oauth';
const HANDOFF = '__Host-feedolio-signin';
const ADA = {
  id: 101,
  login: 'ada',
  name: 'Ada Lovelace',
  avatar_url: 'https://avatars.githubusercontent.com/u/101?v=4',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Collects what the Worker carries on with after answering (ctx.waitUntil). */
function context() {
  /** @type {Promise<unknown>[]} */
  const pending = [];
  return {
    /** @param {Promise<unknown>} promise */
    waitUntil: (promise) => pending.push(promise),
    passThroughOnException() {},
    settled: () => Promise.all(pending),
  };
}

/**
 * Calls the Worker the way a browser would.
 *
 * @param {string} path
 * @param {RequestInit & { env?: object, ctx?: object, cookie?: string }} [options]
 */
function call(path, { env = ENV, ctx, cookie, ...init } = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set('Cookie', cookie);
  return worker.fetch(
    new Request(`${SITE}${path}`, { ...init, headers }),
    /** @type {any} */ (env),
    /** @type {any} */ (ctx),
  );
}

/**
 * The cookies a response sets, by name: value and attributes.
 *
 * @param {Response} response
 * @returns {Record<string, { value: string, attributes: string[] }>}
 */
function cookiesFrom(response) {
  return Object.fromEntries(
    response.headers.getSetCookie().map((line) => {
      const [pair, ...attributes] = line.split('; ');
      const at = pair.indexOf('=');
      return [pair.slice(0, at), { value: pair.slice(at + 1), attributes }];
    }),
  );
}

/** @param {string} text  base64url */
const fromBase64Url = (text) => atob(text.replaceAll('-', '+').replaceAll('_', '/'));

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

/**
 * Starts a sign-in: GitHub's authorize parameters and the cookie this browser
 * now holds.
 *
 * @param {string} [returnTo]
 */
async function startSignIn(returnTo = '/today') {
  const response = await call(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  const params = new URL(/** @type {string} */ (response.headers.get('Location'))).searchParams;
  const { value } = cookiesFrom(response)[OAUTH];
  return { response, params, value, cookie: `${OAUTH}=${value}`, verifier: value.split('.')[1] };
}

/**
 * GitHub, answering as its docs describe.
 *
 * @param {{ token?: () => Response, user?: () => Response, revoke?: () => Response }} [answers]
 */
function github(answers = {}) {
  return fakeInternet({
    [TOKEN_URL]:
      answers.token ??
      (() => Response.json({ access_token: 'gho_secret', token_type: 'bearer', scope: '' })),
    [USER_URL]: answers.user ?? (() => Response.json(ADA)),
    [REVOKE_URL]: answers.revoke ?? (() => new Response(null, { status: 204 })),
  });
}

/**
 * A whole sign-in up to the app collecting the profile: the handoff cookie.
 *
 * @param {Parameters<typeof github>[0]} [answers]
 */
async function signedInHandoff(answers) {
  const requests = github(answers);
  const { params, cookie } = await startSignIn('/today');
  const ctx = context();
  const response = await call(`/api/auth/callback?code=abc&state=${params.get('state')}`, {
    cookie,
    ctx,
  });
  await ctx.settled();
  return { response, requests, handoff: cookiesFrom(response)[HANDOFF]?.value };
}

/** @param {string} handoff @param {Parameters<typeof call>[1]} [options] */
function collect(handoff, options = {}) {
  return call('/api/auth/session', { method: 'POST', cookie: `${HANDOFF}=${handoff}`, ...options });
}

describe('/api/auth/config', () => {
  it('says whether sign-in is set up, and lets the edge keep the answer briefly', async () => {
    const on = await call('/api/auth/config');
    expect(await on.json()).toEqual({ signIn: true });
    expect(on.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(on.headers.get('Cache-Control')).toBe('no-cache');
    expect(on.headers.get('Cloudflare-CDN-Cache-Control')).toBe('max-age=60');

    for (const env of [{}, { GITHUB_CLIENT_ID: 'only-an-id' }]) {
      expect(await (await call('/api/auth/config', { env })).json()).toEqual({ signIn: false });
    }
    // A Worker with no settings at all.
    const bare = await worker.fetch(new Request(`${SITE}/api/auth/config`));
    expect(await bare.json()).toEqual({ signIn: false });
  });
});

describe('/api/auth/login', () => {
  it('sends the reader to GitHub with a fresh state, PKCE and the account picker', async () => {
    const { response, params, value, verifier } = await startSignIn('/today');

    expect(response.status).toBe(302);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const location = new URL(/** @type {string} */ (response.headers.get('Location')));
    expect(`${location.origin}${location.pathname}`).toBe(
      'https://github.com/login/oauth/authorize',
    );
    // No scope: public profile only.
    expect(Object.fromEntries(params)).toEqual({
      client_id: 'test-client-id',
      redirect_uri: `${SITE}/api/auth/callback`,
      state: expect.stringMatching(/^[\w-]{22}$/),
      code_challenge: await s256(verifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });

    // The browser keeps the state, the verifier and where to return, out of
    // reach of scripts and other sites, for as long as GitHub's code lasts.
    const [state, , returnTo] = value.split('.');
    expect(state).toBe(params.get('state'));
    expect(verifier).toMatch(/^[\w-]{43}$/);
    expect(fromBase64Url(returnTo)).toBe('/today');
    expect(cookiesFrom(response)[OAUTH].attributes).toEqual([
      'Path=/',
      'Max-Age=600',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
    ]);

    // Every sign-in gets its own.
    const again = await startSignIn('/today');
    expect(again.params.get('state')).not.toBe(state);
    expect(again.verifier).not.toBe(verifier);
  });

  it('only ever returns to a page of the app', async () => {
    const back = async (/** @type {string} */ returnTo) =>
      (
        await call(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`, { env: {} })
      ).headers.get('Location');

    expect(await back('/today')).toBe('/today?signin=off');
    expect(await back('/tags/Funding%20news')).toBe('/tags/Funding%20news?signin=off');
    for (const elsewhere of [
      '//evil.test/x',
      'https://evil.test',
      '/\\evil.test',
      'javascript:alert(1)',
      '/a b',
      '/today?x=1',
      '',
      `/${'x'.repeat(600)}`,
    ]) {
      expect(await back(elsewhere)).toBe('/?signin=off');
    }
    expect((await call('/api/auth/login', { env: {} })).headers.get('Location')).toBe(
      '/?signin=off',
    );
  });
});

describe('/api/auth/callback', () => {
  it('swaps the code, reads the profile, revokes the token and hands the profile over', async () => {
    const requests = github();
    const { params, cookie, verifier } = await startSignIn('/today');
    const ctx = context();
    const response = await call(`/api/auth/callback?code=abc&state=${params.get('state')}`, {
      cookie,
      ctx,
    });
    await ctx.settled();

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/today?signin=ok');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const cookies = cookiesFrom(response);
    expect(cookies[OAUTH]).toEqual({
      value: '',
      attributes: ['Path=/', 'Max-Age=0', 'HttpOnly', 'Secure', 'SameSite=Lax'],
    });
    expect(cookies[HANDOFF].attributes).toEqual([
      'Path=/',
      'Max-Age=120',
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
    ]);
    // The handoff holds the profile, never the token.
    const [payload] = cookies[HANDOFF].value.split('.');
    expect(JSON.parse(fromBase64Url(payload))).toEqual({
      user: { id: 'github|101', name: 'Ada Lovelace', avatarUrl: ADA.avatar_url },
      exp: expect.any(Number),
    });
    expect(fromBase64Url(payload)).not.toContain('gho_');

    const [exchange, profile, revoke] = requests;
    // The exchange: the app's credentials, the code, the same callback and
    // the PKCE verifier.
    expect([exchange.method, exchange.url]).toEqual(['POST', TOKEN_URL]);
    expect(exchange.headers.get('Accept')).toBe('application/json');
    expect(Object.fromEntries(new URLSearchParams(await exchange.text()))).toEqual({
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      code: 'abc',
      redirect_uri: `${SITE}/api/auth/callback`,
      code_verifier: verifier,
    });
    // The profile, with the token and the headers GitHub's API asks for.
    expect([profile.method, profile.url]).toEqual(['GET', USER_URL]);
    expect(Object.fromEntries(profile.headers)).toMatchObject({
      authorization: 'Bearer gho_secret',
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'Feedolio',
    });
    // Then the token is revoked, with the app's credentials.
    expect([revoke.method, revoke.url]).toEqual(['DELETE', REVOKE_URL]);
    expect(revoke.headers.get('Authorization')).toBe(
      `Basic ${btoa('test-client-id:test-client-secret')}`,
    );
    expect(await revoke.json()).toEqual({ access_token: 'gho_secret' });
    expect(requests).toHaveLength(3);
  });

  it('won’t finish a sign-in this browser didn’t start', async () => {
    const requests = github();
    const { params, cookie, value } = await startSignIn('/today');
    const state = params.get('state');

    const cases = [
      { query: `code=abc&state=${state}`, cookie: undefined, back: '/?signin=failed' },
      { query: 'code=abc&state=someone-elses', cookie, back: '/today?signin=failed' },
      { query: 'code=abc', cookie, back: '/today?signin=failed' },
      { query: `code=abc&state=${state}`, cookie: `${OAUTH}=only.two`, back: '/?signin=failed' },
      {
        query: `code=abc&state=${state}`,
        cookie: `${OAUTH}=${value}.extra`,
        back: '/?signin=failed',
      },
      {
        query: `code=abc&state=${state}`,
        cookie: `${OAUTH}=${state}.verifier.!!!`,
        back: '/?signin=failed',
      },
    ];
    for (const { query, cookie: sent, back } of cases) {
      const response = await call(`/api/auth/callback?${query}`, { cookie: sent });
      expect(response.headers.get('Location'), query).toBe(back);
      expect(cookiesFrom(response)[HANDOFF]).toBeUndefined();
    }
    // GitHub was never asked.
    expect(requests).toEqual([]);
  });

  it('says when the reader said no at GitHub, or GitHub sent no code', async () => {
    const requests = github();
    const { params, cookie } = await startSignIn('/today');
    const state = params.get('state');
    const back = async (/** @type {string} */ query) =>
      (await call(`/api/auth/callback?${query}&state=${state}`, { cookie })).headers.get(
        'Location',
      );

    expect(await back('error=access_denied')).toBe('/today?signin=cancelled');
    expect(await back('error=application_suspended')).toBe('/today?signin=failed');
    expect(await back('nothing=here')).toBe('/today?signin=failed');
    expect(requests).toEqual([]);
  });

  it('fails cleanly when GitHub does, revoking any token it got', async () => {
    const failures = [
      {
        // A bad code or setting: 200 with { error }.
        answers: { token: () => Response.json({ error: 'redirect_uri_mismatch' }) },
        logged: 'redirect_uri_mismatch',
        calls: 1,
      },
      {
        answers: { token: () => new Response('<h1>Unicorn</h1>', { status: 503 }) },
        logged: '503',
        calls: 1,
      },
      {
        answers: { user: () => Response.json({ message: 'Bad credentials' }, { status: 401 }) },
        logged: '401',
        calls: 3,
      },
      {
        answers: { user: () => Response.json({ login: 'no-id' }) },
        logged: 'unexpected answer',
        calls: 3,
      },
    ];
    for (const { answers, logged, calls } of failures) {
      // A fresh network and log for each case.
      vi.restoreAllMocks();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { response, requests } = await signedInHandoff(answers);
      expect(response.headers.get('Location'), logged).toBe('/today?signin=failed');
      expect(cookiesFrom(response)[HANDOFF]).toBeUndefined();
      expect(warn.mock.calls.flat().join(' ')).toContain(logged);
      expect(requests).toHaveLength(calls);
      if (calls === 3) expect(requests[2].method).toBe('DELETE');
    }
  });

  it('fails cleanly when GitHub can’t be reached', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakeInternet();
    const { params, cookie } = await startSignIn('/today');
    const response = await call(`/api/auth/callback?code=abc&state=${params.get('state')}`, {
      cookie,
    });
    expect(response.headers.get('Location')).toBe('/today?signin=failed');
  });

  it('still signs in when the token can’t be revoked, and logs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refused = await signedInHandoff({ revoke: () => new Response(null, { status: 500 }) });
    expect(refused.response.headers.get('Location')).toBe('/today?signin=ok');
    expect(warn).toHaveBeenCalledWith('sign-in: token not revoked (500)');

    vi.restoreAllMocks();
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // GitHub unreachable for the revoke, and no ctx: the Worker waits for it.
    fakeInternet({
      [TOKEN_URL]: () => Response.json({ access_token: 'gho_secret' }),
      [USER_URL]: () => Response.json(ADA),
    });
    const { params, cookie } = await startSignIn('/today');
    const response = await call(`/api/auth/callback?code=abc&state=${params.get('state')}`, {
      cookie,
    });
    expect(response.headers.get('Location')).toBe('/today?signin=ok');
    expect(quiet).toHaveBeenCalledWith('sign-in: token not revoked');
  });

  it('keeps a name and an https picture from any profile', async () => {
    const plain = await signedInHandoff({
      user: () =>
        Response.json({ id: 7, login: 'octo', name: '   ', avatar_url: 'http://insecure.test/a' }),
    });
    const long = await signedInHandoff({
      user: () => Response.json({ id: 8, login: 'long', name: 'N'.repeat(300), avatar_url: null }),
    });

    expect((await (await collect(plain.handoff)).json()).user).toEqual({
      id: 'github|7',
      name: 'octo',
      avatarUrl: null,
    });
    expect((await (await collect(long.handoff)).json()).user.name).toHaveLength(100);
  });

  it('is off without GitHub settings', async () => {
    const { params, cookie } = await startSignIn('/today');
    const response = await call(`/api/auth/callback?code=abc&state=${params.get('state')}`, {
      cookie,
      env: {},
    });
    expect(response.headers.get('Location')).toBe('/today?signin=off');
  });
});

describe('/api/auth/session', () => {
  it('gives the app the profile once, then forgets it', async () => {
    const { handoff } = await signedInHandoff();
    const response = await collect(handoff, { headers: { 'Sec-Fetch-Site': 'same-origin' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      user: { id: 'github|101', name: 'Ada Lovelace', avatarUrl: ADA.avatar_url },
    });
    expect(cookiesFrom(response)[HANDOFF]).toEqual({
      value: '',
      attributes: ['Path=/', 'Max-Age=0', 'HttpOnly', 'Secure', 'SameSite=Strict'],
    });

    // The browser dropped it, so there's nothing left to collect.
    const again = await call('/api/auth/session', { method: 'POST' });
    expect(again.status).toBe(401);
    expect((await again.json()).error.code).toBe('NOT_SIGNED_IN');
  });

  it('answers only Feedolio’s own pages', async () => {
    const { handoff } = await signedInHandoff();
    for (const headers of [{ 'Sec-Fetch-Site': 'cross-site' }, { Origin: 'https://evil.test' }]) {
      const response = await collect(handoff, { headers });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('FORBIDDEN');
      expect(cookiesFrom(response)[HANDOFF].attributes).toContain('Max-Age=0');
    }
    expect((await collect(handoff, { headers: { Origin: SITE } })).status).toBe(200);
  });

  it('turns away handoffs that are forged, expired, malformed or from another secret', async () => {
    const { handoff } = await signedInHandoff();
    const [payload, signature] = handoff.split('.');
    const forged = `${payload.slice(0, -2)}xx.${signature}`;

    for (const value of [forged, 'no-dot', 'a.b.c', '!!!.###', `${payload}.`]) {
      expect((await collect(value)).status, value).toBe(401);
    }
    const rotated = { ...ENV, GITHUB_CLIENT_SECRET: 'a-new-secret' };
    expect((await collect(handoff, { env: rotated })).status).toBe(401);
    expect((await collect(handoff, { env: {} })).status).toBe(401);

    vi.useFakeTimers({ now: Date.now() + 121_000, toFake: ['Date'] });
    expect((await collect(handoff)).status).toBe(401);
  });
});

describe('/api/auth/*', () => {
  it('answers only the methods and addresses it has', async () => {
    const wrongMethod = await call('/api/auth/session');
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('Allow')).toBe('POST');
    expect((await call('/api/auth/login', { method: 'POST' })).headers.get('Allow')).toBe('GET');
    expect((await call('/api/auth/nope')).status).toBe(404);
  });
});
