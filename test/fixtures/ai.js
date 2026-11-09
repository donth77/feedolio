import { http, HttpResponse } from 'msw';
import anthropicJudgments from './ai/anthropic-judgments.json';
import anthropicModels from './ai/anthropic-models.json';
import anthropicExplainStocks from './ai/anthropic-explain-stocks.sse?raw';
import anthropicSummarizePandemic from './ai/anthropic-summarize-pandemic.sse?raw';
import anthropicSummary from './ai/anthropic-summary.sse?raw';
import anthropicTranslateStocksEs from './ai/anthropic-translate-stocks-es.sse?raw';
import customModels from './ai/custom-models.json';
import jevModels from './ai/jev-models.json';
import jevSystemOne from './ai/jev-systemone.json';
import ollamaModels from './ai/ollama-models.json';
import openaiModels from './ai/openai-models.json';
import openaiSummary from './ai/openai-summary.sse?raw';
import openrouterKey from './ai/openrouter-key.json';
import openrouterModels from './ai/openrouter-models.json';

/**
 * Fake AI providers for tests, answering with recorded responses (see
 * test/fixtures/README.md). Each provider accepts only its own test key, and
 * test/setup/journeys.js fails any test that sends a key anywhere else.
 */

const RECORDED = {
  'anthropic-judgments.json': anthropicJudgments,
  'anthropic-models.json': anthropicModels,
  'custom-models.json': customModels,
  'jev-models.json': jevModels,
  'jev-systemone.json': jevSystemOne,
  'ollama-models.json': ollamaModels,
  'openai-models.json': openaiModels,
  'openrouter-key.json': openrouterKey,
  'openrouter-models.json': openrouterModels,
};
const STREAMS = {
  'anthropic-explain-stocks.sse': anthropicExplainStocks,
  'anthropic-summarize-pandemic.sse': anthropicSummarizePandemic,
  'anthropic-summary.sse': anthropicSummary,
  'anthropic-translate-stocks-es.sse': anthropicTranslateStocksEs,
  'openai-summary.sse': openaiSummary,
};

/**
 * A recorded JSON answer, as a fresh copy.
 *
 * @param {keyof typeof RECORDED} name
 */
export const recorded = (name) => structuredClone(RECORDED[name]);

/**
 * A recorded event stream, as text.
 *
 * @param {keyof typeof STREAMS} name
 */
export const recordedStream = (name) => STREAMS[name];

/** Test keys. None of them is real. */
export const TEST_KEYS = {
  anthropic: 'sk-ant-api03-test-0000000000000000000000000000a1b2',
  openai: 'sk-proj-test-1111111111111111111111111111c3d4',
  openrouter: 'sk-or-v1-test-2222222222222222222222222222e5f6',
  custom: 'custom-test-key-33333333333333333333g7h8',
  typesafe: 'ts-test-key-4444444444444444444444444444j9k0',
};

/** The only host each test key may be sent to. */
export const KEY_HOSTS = {
  [TEST_KEYS.anthropic]: 'api.anthropic.com',
  [TEST_KEYS.openai]: 'api.openai.com',
  [TEST_KEYS.openrouter]: 'openrouter.ai',
  [TEST_KEYS.custom]: 'llm.example.test',
  [TEST_KEYS.typesafe]: 'api.typesafe.ai',
};

/** Every host that serves AI, for checking nothing calls them unasked. */
export const AI_HOSTS = [
  'api.anthropic.com',
  'api.openai.com',
  'openrouter.ai',
  'llm.example.test',
  'api.typesafe.ai',
  'localhost:11434',
];

export const CUSTOM_BASE_URL = 'https://llm.example.test/v1';

/** @param {Request} request @param {string} key */
const hasBearer = (request, key) => request.headers.get('authorization') === `Bearer ${key}`;

const unauthorizedOpenAi = () =>
  HttpResponse.json(
    {
      error: {
        message: 'Incorrect API key provided. You can find your API key in your account settings.',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    },
    { status: 401 },
  );

/**
 * A streamed answer, as a response.
 *
 * @param {keyof typeof STREAMS | ReadableStream<Uint8Array>} stream  a recording, or a stream a test feeds
 */
export const eventStream = (stream) =>
  new HttpResponse(typeof stream === 'string' ? STREAMS[stream] : stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });

/**
 * Anthropic's answer to a story-page action, picked by what the request asks
 * for. Each was recorded with Feedolio's own prompts.
 *
 * @param {any} body
 */
function anthropicAnswer(body) {
  const system = String(body?.system ?? '');
  if (system.startsWith('You translate')) return eventStream('anthropic-translate-stocks-es.sse');
  if (system.startsWith('You explain')) return eventStream('anthropic-explain-stocks.sse');
  return eventStream('anthropic-summarize-pandemic.sse');
}

/** Answers like the real providers, as recorded or as their docs show. */
export const aiHandlers = [
  // Anthropic (recorded 2026-11-09)
  // The SDK sends the key as a bearer token; the API takes x-api-key too.
  http.get('https://api.anthropic.com/v1/models', ({ request }) =>
    hasBearer(request, TEST_KEYS.anthropic) || request.headers.get('x-api-key') === TEST_KEYS.anthropic
      ? HttpResponse.json(recorded('anthropic-models.json'))
      : HttpResponse.json(
          {
            type: 'error',
            error: { type: 'authentication_error', message: 'invalid x-api-key' },
          },
          { status: 401 },
        ),
  ),

  http.post('https://api.anthropic.com/v1/messages', async ({ request }) =>
    hasBearer(request, TEST_KEYS.anthropic)
      ? anthropicAnswer(await request.json())
      : HttpResponse.json(
          {
            type: 'error',
            error: { type: 'authentication_error', message: 'invalid x-api-key' },
          },
          { status: 401 },
        ),
  ),

  // OpenAI
  http.get('https://api.openai.com/v1/models', ({ request }) =>
    hasBearer(request, TEST_KEYS.openai)
      ? HttpResponse.json(recorded('openai-models.json'))
      : unauthorizedOpenAi(),
  ),

  // OpenRouter: the model list is public (recorded); the key check isn't.
  http.get('https://openrouter.ai/api/v1/key', ({ request }) =>
    hasBearer(request, TEST_KEYS.openrouter)
      ? HttpResponse.json(recorded('openrouter-key.json'))
      : HttpResponse.json({ error: { message: 'User not found.', code: 401 } }, { status: 401 }),
  ),
  http.get('https://openrouter.ai/api/v1/models', () =>
    HttpResponse.json(recorded('openrouter-models.json')),
  ),

  // Ollama on this computer, with OLLAMA_ORIGINS set
  http.get('http://localhost:11434/v1/models', () =>
    HttpResponse.json(recorded('ollama-models.json')),
  ),

  // The reader's own OpenAI-compatible server
  http.get(`${CUSTOM_BASE_URL}/models`, ({ request }) =>
    hasBearer(request, TEST_KEYS.custom)
      ? HttpResponse.json(recorded('custom-models.json'))
      : unauthorizedOpenAi(),
  ),

  // TypeSafe's own API (recorded 2026-11-09). Browsers can't reach it from
  // other sites; tests that need that say so with server.use().
  http.get('https://api.typesafe.ai/v1/models', ({ request }) =>
    hasBearer(request, TEST_KEYS.typesafe)
      ? HttpResponse.json(recorded('jev-models.json'))
      : HttpResponse.json({ detail: 'Invalid API key' }, { status: 401 }),
  ),
];

/**
 * Saves an AI setup the way the app would, so a test can start with AI on.
 *
 * @param {{ general?: 'anthropic'|'openrouter'|'ollama', decision?: 'openrouter'|'typesafe', remember?: boolean }} setup
 */
export function seedAi({ general = 'anthropic', decision, remember = true } = {}) {
  const generals = {
    anthropic: {
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-5-5',
      traits: { effort: true, json: true, maxOutput: 128000 },
      key: TEST_KEYS.anthropic,
    },
    openrouter: {
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-5',
      traits: { json: true },
      key: TEST_KEYS.openrouter,
    },
    ollama: {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3.2:latest',
      traits: { json: true },
      key: null,
    },
  };
  const { key, ...connection } = generals[general];
  const saved = JSON.parse(localStorage.getItem('feedolio:v1') ?? '{"version":1}');
  saved.aiSettings = {
    ...saved.aiSettings,
    general: connection,
    decision: decision ? { provider: decision } : null,
    rememberKeys: remember,
  };
  localStorage.setItem('feedolio:v1', JSON.stringify(saved));
  const keys = {
    ...(key ? { general: key } : {}),
    ...(decision ? { decision: decision === 'typesafe' ? TEST_KEYS.typesafe : TEST_KEYS.openrouter } : {}),
  };
  (remember ? localStorage : sessionStorage).setItem('feedolio:ai-keys:v1', JSON.stringify(keys));
}
