import { AiError, errorForStatus, providerMessage, scrub } from '../errors.js';

/**
 * Small HTTP helpers shared by the fetch-based adapters (OpenAI-compatible
 * servers and Jev). Each request goes only to the provider's own address,
 * with the key in an Authorization header.
 */

/**
 * Calls a provider and turns failures into AiErrors. A browser that can't
 * reach the server (offline, wrong address, or the server doesn't allow this
 * site) only says "TypeError", so that's reported as a network problem.
 *
 * @param {string} url
 * @param {RequestInit & { key?: string|null }} init
 */
export async function call(url, { key, headers, ...init }) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        ...headers,
      },
      // Keys are for the provider only: never send cookies or the page's address.
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    throw isAbort(error) ? new AiError('aborted') : new AiError('network');
  }
  if (!response.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch {
      // Not JSON: the status says enough.
    }
    throw errorForStatus(response.status, scrub(providerMessage(body), key));
  }
  return response;
}

/**
 * A response's JSON body.
 *
 * @param {Response} response
 * @returns {Promise<any>}
 */
export async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    throw isAbort(error) ? new AiError('aborted') : new AiError('bad-response');
  }
}

/**
 * The data lines of a server-sent event stream, as they arrive.
 *
 * @param {ReadableStream<Uint8Array>} stream
 * @returns {AsyncGenerator<string>}
 */
export async function* eventData(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = done ? '' : (lines.pop() ?? '');
      for (const line of lines) {
        if (line.startsWith('data:')) yield line.slice(5).trim();
      }
      if (done) return;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/**
 * Parses a JSON answer, allowing for the code fences some models add.
 *
 * @param {string} text
 */
export function parseJsonAnswer(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new AiError('bad-response');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiError('bad-response');
  }
}

/**
 * Whether the reader stopped the request. (A timeout counts as not reaching
 * the server.)
 *
 * @param {unknown} error
 */
export function isAbort(error) {
  return /** @type {{ name?: string }|null} */ (error)?.name === 'AbortError';
}
