/**
 * What went wrong with an AI request, in a form the UI can explain. Messages
 * never include a key: anything a provider says is scrubbed of the key that
 * was sent before it's kept.
 */

/**
 * - auth: the key was rejected (401)
 * - forbidden: the key can't do this (403)
 * - not-found: no API or model at that address (404)
 * - rate: too many requests (429)
 * - server: the provider had a problem (5xx)
 * - network: the browser couldn't reach the server (offline, wrong address, or CORS)
 * - request: the provider turned the request down (other 4xx)
 * - refused: the model declined to answer
 * - bad-response: the answer couldn't be read
 * - aborted: the reader stopped it
 * - setup: AI isn't set up (no model, or its key is gone)
 *
 * @typedef {'auth'|'forbidden'|'not-found'|'rate'|'server'|'network'|'request'|'refused'|'bad-response'|'aborted'|'setup'} AiErrorCode
 */

export class AiError extends Error {
  /**
   * @param {AiErrorCode} code
   * @param {{ status?: number, detail?: string }} [extra]
   *   detail: the provider's own words, already scrubbed of the key
   */
  constructor(code, { status, detail } = {}) {
    super(code);
    this.name = 'AiError';
    /** @type {AiErrorCode} */
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/**
 * The error for an HTTP status.
 *
 * @param {number} status
 * @param {string} [detail]
 */
export function errorForStatus(status, detail) {
  if (status === 401) return new AiError('auth', { status, detail });
  if (status === 403) return new AiError('forbidden', { status, detail });
  if (status === 404) return new AiError('not-found', { status, detail });
  if (status === 429) return new AiError('rate', { status, detail });
  if (status >= 500) return new AiError('server', { status, detail });
  return new AiError('request', { status, detail });
}

/**
 * Removes a key from text a provider sent back, and keeps it short.
 *
 * @param {unknown} text
 * @param {string|null|undefined} key
 */
export function scrub(text, key) {
  if (typeof text !== 'string' || !text.trim()) return undefined;
  let clean = text;
  if (key) clean = clean.split(key).join('[your key]');
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean.length > 200 ? `${clean.slice(0, 199)}…` : clean;
}

/**
 * The provider's own message from an error body, whatever its shape:
 * { error: { message } } (OpenAI, Anthropic, OpenRouter), { error: "…" }
 * (Ollama) or { detail } (TypeSafe).
 *
 * @param {unknown} body
 */
export function providerMessage(body) {
  if (!body || typeof body !== 'object') return undefined;
  const value = /** @type {Record<string, any>} */ (body);
  if (typeof value.error === 'string') return value.error;
  if (typeof value.error?.message === 'string') return value.error.message;
  if (typeof value.detail === 'string') return value.detail;
  if (Array.isArray(value.detail) && typeof value.detail[0]?.msg === 'string') {
    return value.detail[0].msg;
  }
  if (typeof value.message === 'string') return value.message;
  return undefined;
}

/**
 * What to tell the reader, in plain words.
 *
 * @param {unknown} error
 * @param {{ label: string, host: string, local?: boolean, decision?: 'typesafe'|'openrouter' }} provider
 *   local: the server is on this computer (Ollama's advice applies)
 */
export function describeAiError(error, { label, host, local = false, decision }) {
  const code = error instanceof AiError ? error.code : 'network';
  const status = error instanceof AiError ? error.status : undefined;
  const detail = error instanceof AiError ? error.detail : undefined;
  const said = detail ? ` ${label} said: “${detail}”` : '';

  switch (code) {
    case 'auth':
      return 'The provider rejected this key (401). Check it and paste it again.';
    case 'forbidden':
      return `${label} turned this key down (403). Check what the key is allowed to do.${said}`;
    case 'not-found':
      return `Nothing answered at ${host} (404). Check the address.`;
    case 'rate':
      return `${label} is limiting requests right now (429). Wait a moment, then try again.`;
    case 'server':
      return `${label} had a problem (${status ?? 'error'}). Try again in a moment.`;
    case 'request':
      return `${label} turned the request down (${status ?? 'error'}).${said}`;
    case 'refused':
      return 'The model declined to answer this one.';
    case 'bad-response':
      return `${label} sent an answer Feedolio couldn’t read.`;
    case 'aborted':
      return 'Stopped.';
    case 'setup':
      return 'Set up AI in Settings › AI first.';
    default:
      if (decision === 'typesafe') {
        return `Couldn’t reach ${host}. TypeSafe’s API doesn’t accept requests from other websites yet, so use Jev through OpenRouter.`;
      }
      if (local) {
        return `Couldn’t reach ${host}. Ollama must allow this site: set OLLAMA_ORIGINS, restart Ollama, then test again.`;
      }
      return `Couldn’t reach ${host}. Check the address and your connection. Your own server must also allow requests from this site (CORS).`;
  }
}
