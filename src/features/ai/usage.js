/**
 * Counts this session's AI requests and roughly how many tokens they sent,
 * so the reader's bill holds no surprises (US-113). Kept in sessionStorage:
 * it survives a reload but not closing the tab. Providers' own counts are
 * used when they report them; otherwise about four characters make a token.
 */

const USAGE_KEY = 'feedolio:ai-usage';

/** @typedef {{ requests: number, tokensSent: number, tokensReceived: number }} Usage */

/** @type {Usage} */
const EMPTY = { requests: 0, tokensSent: 0, tokensReceived: 0 };
const listeners = new Set();
/** @type {Usage|null} */
let cached = null;

/** @returns {Storage|null} */
function storage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** This session's usage so far. Returns the same object until it changes. */
export function readUsage() {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(storage()?.getItem(USAGE_KEY) ?? 'null');
    cached = {
      requests: Number(parsed?.requests) || 0,
      tokensSent: Number(parsed?.tokensSent) || 0,
      tokensReceived: Number(parsed?.tokensReceived) || 0,
    };
  } catch {
    cached = { ...EMPTY };
  }
  return cached;
}

/**
 * Adds one request.
 *
 * @param {{ tokensSent: number, tokensReceived?: number }} request
 */
export function recordUsage({ tokensSent, tokensReceived = 0 }) {
  const now = readUsage();
  cached = {
    requests: now.requests + 1,
    tokensSent: now.tokensSent + Math.max(0, Math.round(tokensSent)),
    tokensReceived: now.tokensReceived + Math.max(0, Math.round(tokensReceived)),
  };
  try {
    storage()?.setItem(USAGE_KEY, JSON.stringify(cached));
  } catch {
    // The count still shows for this page.
  }
  for (const listener of listeners) listener();
}

/**
 * About how many tokens some text is, when the provider doesn't say.
 *
 * @param {string} text
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeToUsage(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Starts the count again (tests start each journey fresh). */
export function resetUsage() {
  cached = null;
  try {
    storage()?.removeItem(USAGE_KEY);
  } catch {
    // Nothing to clear.
  }
  for (const listener of listeners) listener();
}
