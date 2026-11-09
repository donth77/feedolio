/**
 * The AI providers a reader can connect, and what Settings › AI says about
 * each. Feedolio talks to them straight from the browser with the reader's
 * own key (ADR-008).
 */

/** @typedef {'anthropic'|'openai'|'openrouter'|'ollama'|'custom'} GeneralProvider */
/** @typedef {'openrouter'|'typesafe'} DecisionProvider */

/**
 * @typedef {Object} ProviderInfo
 * @property {string} label
 * @property {string} baseUrl         The API's address; '' when the reader types it
 * @property {boolean} editableUrl    The reader can change the address
 * @property {'required'|'optional'|'none'} key
 * @property {string} placeholder     For the key field
 * @property {string} help            Under the key field
 * @property {string} [defaultModel]  Picked after connecting, when the list has it
 */

/** @type {Record<GeneralProvider, ProviderInfo>} */
export const GENERAL_PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    editableUrl: false,
    key: 'required',
    placeholder: 'sk-ant-…',
    help: 'Starts with sk-ant-. Create one in the Anthropic Console.',
    defaultModel: 'claude-opus-5-5',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    editableUrl: false,
    key: 'required',
    placeholder: 'Paste your OpenAI key',
    help: 'Create one in your OpenAI account settings.',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    editableUrl: false,
    key: 'required',
    placeholder: 'Paste your OpenRouter key',
    help: 'One OpenRouter key reaches many model providers.',
  },
  ollama: {
    label: 'Ollama (on this computer)',
    baseUrl: 'http://localhost:11434/v1',
    editableUrl: true,
    key: 'none',
    placeholder: 'Not needed for Ollama',
    help: 'Ollama runs on your computer, so no key is needed.',
  },
  custom: {
    label: 'Other OpenAI-compatible',
    baseUrl: '',
    editableUrl: true,
    key: 'optional',
    placeholder: 'Paste your key, if the server needs one',
    help: 'Any server with an OpenAI-compatible chat completions endpoint.',
  },
};

/**
 * Jev answers yes/no and scoring questions with calibrated confidence. Both
 * routes take the same request format. TypeSafe's own API accepts requests
 * only from TypeSafe's console (checked 2026-11-09), so in a browser Jev works
 * through OpenRouter.
 *
 * @type {Record<DecisionProvider, ProviderInfo & { model: string }>}
 */
export const DECISION_PROVIDERS = {
  openrouter: {
    label: 'TypeSafe Jev · OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    editableUrl: false,
    key: 'required',
    placeholder: 'Paste your OpenRouter key',
    help: 'Your OpenRouter key works for Jev too.',
    model: '~typesafe/jev-latest',
  },
  typesafe: {
    label: 'TypeSafe Jev · TypeSafe API',
    baseUrl: 'https://api.typesafe.ai/v1',
    editableUrl: false,
    key: 'required',
    placeholder: 'Paste your TypeSafe key',
    help: 'TypeSafe’s API doesn’t accept requests from other websites yet. If Test connection can’t reach it, use Jev through OpenRouter.',
    model: 'jev-latest',
  },
};

/**
 * The host a key is sent to, as the reader would recognise it.
 *
 * @param {string} baseUrl
 */
export function hostOf(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return '';
  }
}

/**
 * A base URL the reader typed, tidied: http(s) only, no trailing slash.
 * Returns null when it isn't a usable address.
 *
 * @param {string} value
 */
export function cleanBaseUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

/**
 * Whether an address is on this computer, where Ollama and other local
 * servers run.
 *
 * @param {string} baseUrl
 */
export function isLocal(baseUrl) {
  const host = hostOf(baseUrl).replace(/:\d+$/, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/**
 * How a saved key is shown: its prefix and last four characters, never more.
 *
 * @param {string} key
 */
export function maskKey(key) {
  const prefix = /^[a-z]+-(?:[a-z]+-)?/i.exec(key)?.[0] ?? '';
  if (key.length < prefix.length + 8) return '••••';
  return `${prefix}…${key.slice(-4)}`;
}
