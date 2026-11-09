import worker from '../../worker/index.js';

/**
 * Our own /api/*, run in-process the way a browser reaches it: with the
 * Worker's settings for this test, sending the cookies it set earlier and
 * keeping the ones it sets now.
 */

/** The Worker's vars and secrets for this test; none by default (sign-in off). */
export const workerEnv = /** @type {Record<string, string>} */ ({});

/** The browser's cookies for our site, by name. */
const jar = new Map();
/** Work the Worker carries on with after answering (ctx.waitUntil). */
const pending = new Set();

const ctx = {
  /** @param {Promise<unknown>} promise */
  waitUntil(promise) {
    pending.add(promise);
    promise.finally(() => pending.delete(promise));
  },
  passThroughOnException() {},
};

/**
 * Sends a request to the Worker as the browser would.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function callWorker(request) {
  const headers = new Headers(request.headers);
  if (jar.size > 0) {
    headers.set('Cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
  }
  const response = await worker.fetch(new Request(request, { headers }), workerEnv, ctx);
  for (const line of response.headers.getSetCookie()) {
    const [pair, ...attributes] = line.split(';');
    const at = pair.indexOf('=');
    const name = pair.slice(0, at).trim();
    if (attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute))) jar.delete(name);
    else jar.set(name, pair.slice(at + 1).trim());
  }
  return response;
}

/** The names of the cookies the browser holds for our site. */
export function cookieNames() {
  return [...jar.keys()];
}

/** Forgets every cookie, as a different browser would have none. */
export function clearCookies() {
  jar.clear();
}

/** Waits for work the Worker carried on with after answering. */
export async function workerSettled() {
  await Promise.all([...pending]);
}

/** A fresh browser, and a Worker without settings. */
export function resetWorker() {
  jar.clear();
  pending.clear();
  for (const key of Object.keys(workerEnv)) delete workerEnv[key];
}
