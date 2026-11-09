import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AiError } from '../../src/features/ai/errors.js';
import { createAnthropicAdapter } from '../../src/features/ai/providers/anthropic.js';
import { createDecisionAdapter } from '../../src/features/ai/providers/decision.js';
import { eventData, parseJsonAnswer } from '../../src/features/ai/providers/http.js';
import { createOpenAiCompatibleAdapter } from '../../src/features/ai/providers/openaiCompatible.js';
import {
  aiHandlers,
  CUSTOM_BASE_URL,
  recorded,
  recordedStream,
  TEST_KEYS,
} from '../fixtures/ai.js';

const server = setupServer(...aiHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** What the recorded Anthropic stream says, in full. */
const RECORDED_SUMMARY =
  'On Tuesday, the city council approved a new network of protected bike lanes. Construction begins in spring and will add 40 km of lanes over three years.';

/**
 * A response body that arrives in small, uneven pieces, as streams do.
 *
 * @param {string} text
 * @param {number} [size]
 */
function trickle(text, size = 7) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let at = 0; at < bytes.length; at += size)
        controller.enqueue(bytes.slice(at, at + size));
      controller.close();
    },
  });
}

/** @param {() => Promise<unknown>} run */
async function failure(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {AiError} */ (error);
  }
  throw new Error('Expected it to fail');
}

describe('The Anthropic adapter', () => {
  // Made inside each test: the SDK keeps the fetch it finds when it's built,
  // and the network fake has to be in place by then.
  const anthropic = () =>
    createAnthropicAdapter({
      apiKey: TEST_KEYS.anthropic,
      model: 'claude-opus-5-5',
      traits: { effort: true, json: true, maxOutput: 128000 },
    });

  it('lists models with what each can do', async () => {
    const models = await anthropic().listModels();
    expect(models).toHaveLength(14);
    expect(models.find((model) => model.id === 'claude-opus-5-5')).toEqual({
      id: 'claude-opus-5-5',
      label: 'Claude Opus 5.5',
      traits: { effort: true, json: true, maxOutput: 128000 },
    });
    expect(models.find((model) => model.id === 'claude-haiku-4-5-20251001')?.traits.effort).toBe(
      false,
    );
  });

  it('streams an answer, with the refusal fallback and low effort (recorded)', async () => {
    /** @type {any} */
    let sent = null;
    server.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        sent = { body: await request.json(), beta: request.headers.get('anthropic-beta') };
        return new HttpResponse(trickle(recordedStream('anthropic-summary.sse'), 13), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );
    /** @type {string[]} */
    const pieces = [];
    const result = await anthropic().streamText({
      system: 'You summarise.',
      prompt: 'Summarise this.',
      effort: 'low',
      onText: (piece) => pieces.push(piece),
    });

    expect(result).toEqual({
      text: RECORDED_SUMMARY,
      model: 'claude-opus-5-5',
      usage: { tokensSent: 95, tokensReceived: 49 },
    });
    expect(pieces.length).toBeGreaterThan(3);
    expect(pieces.join('')).toBe(RECORDED_SUMMARY);
    expect(sent.beta).toContain('server-side-fallback-2026-07-01');
    expect(sent.body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 64000,
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: 'You summarise.',
      messages: [{ role: 'user', content: 'Summarise this.' }],
      stream: true,
    });
  });

  it('reports a refusal instead of a cut-off answer', async () => {
    const refused = recordedStream('anthropic-summary.sse').replace(
      '"stop_reason":"end_turn"',
      '"stop_reason":"refusal"',
    );
    server.use(
      http.post(
        'https://api.anthropic.com/v1/messages',
        () => new HttpResponse(refused, { headers: { 'Content-Type': 'text/event-stream' } }),
      ),
    );
    const error = await failure(() => anthropic().streamText({ system: 's', prompt: 'p' }));
    expect(error).toBeInstanceOf(AiError);
    expect(error.code).toBe('refused');
  });

  it('asks for JSON with a schema and reads it (recorded)', async () => {
    /** @type {any} */
    let sent = null;
    server.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(recorded('anthropic-judgments.json'));
      }),
    );
    const schema = { type: 'object', properties: {}, additionalProperties: false };
    const result = await anthropic().json({
      system: 'Judge.',
      prompt: 'Stories',
      name: 'j',
      schema,
      effort: 'low',
    });

    expect(result.data).toEqual({
      judgments: [
        { id: 's1', match: true, confidence: 0.97 },
        { id: 's2', match: false, confidence: 0.95 },
      ],
    });
    expect(result.usage).toEqual({ tokensSent: 464, tokensReceived: 53 });
    expect(sent.output_config).toEqual({ effort: 'low', format: { type: 'json_schema', schema } });
    expect(sent.max_tokens).toBe(16000);
  });

  it('asks in words for models without structured output or effort', async () => {
    /** @type {any} */
    let sent = null;
    server.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        sent = await request.json();
        const answer = recorded('anthropic-judgments.json');
        answer.content[0].text = `Here you go:\n\`\`\`json\n${answer.content[0].text}\n\`\`\``;
        delete answer.usage.iterations;
        return HttpResponse.json(answer);
      }),
    );
    const older = createAnthropicAdapter({
      apiKey: TEST_KEYS.anthropic,
      model: 'claude-haiku-4-5-20251001',
      traits: { effort: false, json: false, maxOutput: 8000 },
    });
    const result = await older.json({
      system: 'Judge.',
      prompt: 'p',
      name: 'j',
      schema: {},
      effort: 'low',
    });
    expect(result.data.judgments).toHaveLength(2);
    expect(result.usage).toEqual({ tokensSent: 464, tokensReceived: 53 });
    expect(sent.output_config).toBeUndefined();
    expect(sent.max_tokens).toBe(8000);
    expect(sent.system).toMatch(/Answer with JSON only/);
  });

  it('turns API errors into plain reasons, without the key', async () => {
    const wrong = createAnthropicAdapter({ apiKey: 'sk-ant-wrong' });
    expect((await failure(() => wrong.listModels())).code).toBe('auth');

    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        HttpResponse.json(
          {
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message: `Key ${TEST_KEYS.anthropic} has no credit.`,
            },
          },
          { status: 400 },
        ),
      ),
    );
    const error = await failure(() => anthropic().streamText({ system: 's', prompt: 'p' }));
    expect(error.code).toBe('request');
    expect(error.detail).toBe('Key [your key] has no credit.');

    server.use(http.get('https://api.anthropic.com/v1/models', () => HttpResponse.error()));
    expect((await failure(() => anthropic().listModels())).code).toBe('network');

    const stopped = new AbortController();
    stopped.abort();
    expect(
      (
        await failure(() =>
          anthropic().streamText({ system: 's', prompt: 'p', signal: stopped.signal }),
        )
      ).code,
    ).toBe('aborted');
  });

  it('reports an answer it can’t read', async () => {
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        HttpResponse.json({
          ...recorded('anthropic-judgments.json'),
          content: [{ type: 'text', text: 'No JSON here' }],
        }),
      ),
    );
    expect(
      (await failure(() => anthropic().json({ system: 's', prompt: 'p', name: 'j', schema: {} })))
        .code,
    ).toBe('bad-response');
  });
});

describe('The OpenAI-compatible adapter', () => {
  it('lists models from OpenAI, and from OpenRouter after checking the key', async () => {
    const openai = createOpenAiCompatibleAdapter({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: TEST_KEYS.openai,
    });
    expect((await openai.listModels()).map((model) => model.id)).toEqual([
      'gpt-5',
      'gpt-5-mini',
      'gpt-4.1',
    ]);

    const openrouter = createOpenAiCompatibleAdapter({
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: TEST_KEYS.openrouter,
    });
    const models = await openrouter.listModels();
    expect(models.find((model) => model.id === 'openai/gpt-5')).toEqual({
      id: 'openai/gpt-5',
      label: 'OpenAI: GPT-5',
      traits: { json: true },
    });

    const wrongKey = createOpenAiCompatibleAdapter({
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-or-wrong',
    });
    const error = await failure(() => wrongKey.listModels());
    expect(error.code).toBe('auth');
    expect(error.detail).toBe('User not found.');
  });

  it('needs no key for Ollama, and says when a server lists nothing readable', async () => {
    const ollama = createOpenAiCompatibleAdapter({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
    });
    expect((await ollama.listModels()).map((model) => model.id)).toEqual([
      'llama3.2:latest',
      'qwen3:8b',
    ]);

    server.use(
      http.get('http://localhost:11434/v1/models', () => HttpResponse.json({ models: [] })),
    );
    expect((await failure(() => ollama.listModels())).code).toBe('bad-response');
    server.use(http.get('http://localhost:11434/v1/models', () => new HttpResponse('<html>')));
    expect((await failure(() => ollama.listModels())).code).toBe('bad-response');
    server.use(http.get('http://localhost:11434/v1/models', () => HttpResponse.error()));
    expect((await failure(() => ollama.listModels())).code).toBe('network');
  });

  const custom = createOpenAiCompatibleAdapter({
    provider: 'custom',
    baseUrl: CUSTOM_BASE_URL,
    apiKey: TEST_KEYS.custom,
    model: 'gpt-5-mini',
  });

  it('streams an answer, however the pieces arrive', async () => {
    /** @type {any} */
    let sent = null;
    server.use(
      http.post(`${CUSTOM_BASE_URL}/chat/completions`, async ({ request }) => {
        sent = { body: await request.json(), auth: request.headers.get('authorization') };
        return new HttpResponse(
          trickle(recordedStream('openai-summary.sse').replaceAll('\n', '\r\n'), 5),
          {
            headers: { 'Content-Type': 'text/event-stream' },
          },
        );
      }),
    );
    /** @type {string[]} */
    const pieces = [];
    const result = await custom.streamText({
      system: 'You summarise.',
      prompt: 'Summarise this.',
      onText: (piece) => pieces.push(piece),
    });
    expect(result).toEqual({
      text: 'The council approved 40 km of protected bike lanes.',
      model: 'gpt-5-mini',
      usage: { tokensSent: 88, tokensReceived: 12 },
    });
    expect(pieces).toEqual(['The council approved', ' 40 km of protected bike lanes.']);
    expect(sent.auth).toBe(`Bearer ${TEST_KEYS.custom}`);
    expect(sent.body).toEqual({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: 'You summarise.' },
        { role: 'user', content: 'Summarise this.' },
      ],
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it('reports errors part-way through a stream, refusals and broken streams', async () => {
    const stream = (/** @type {string} */ body) =>
      http.post(
        `${CUSTOM_BASE_URL}/chat/completions`,
        () => new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } }),
      );

    server.use(
      stream(
        `: keep-alive\n\ndata: not json\n\ndata: {"error":{"code":429,"message":"Rate limited for ${TEST_KEYS.custom}"}}\n\n`,
      ),
    );
    const limited = await failure(() => custom.streamText({ system: 's', prompt: 'p' }));
    expect(limited.code).toBe('rate');
    expect(limited.detail).toBe('Rate limited for [your key]');

    server.use(stream('data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\n'));
    expect((await failure(() => custom.streamText({ system: 's', prompt: 'p' }))).code).toBe(
      'refused',
    );

    server.use(
      http.post(`${CUSTOM_BASE_URL}/chat/completions`, () => {
        const broken = new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'),
            );
            controller.error(new Error('Connection reset'));
          },
        });
        return new HttpResponse(broken, { headers: { 'Content-Type': 'text/event-stream' } });
      }),
    );
    expect((await failure(() => custom.streamText({ system: 's', prompt: 'p' }))).code).toBe(
      'network',
    );

    server.use(
      http.post(`${CUSTOM_BASE_URL}/chat/completions`, () =>
        HttpResponse.json({ error: { message: 'No such model' } }, { status: 404 }),
      ),
    );
    expect((await failure(() => custom.streamText({ system: 's', prompt: 'p' }))).code).toBe(
      'not-found',
    );

    const stopped = new AbortController();
    stopped.abort();
    expect(
      (await failure(() => custom.streamText({ system: 's', prompt: 'p', signal: stopped.signal })))
        .code,
    ).toBe('aborted');
  });

  it('asks for JSON with a schema, and in words where the server won’t take one', async () => {
    /** @type {any[]} */
    const bodies = [];
    const answer = {
      model: 'gpt-5-mini',
      choices: [
        { message: { content: '{"judgments":[{"id":"a","match":true,"confidence":0.9}]}' } },
      ],
      usage: { prompt_tokens: 50, completion_tokens: 20 },
    };
    server.use(
      http.post(`${CUSTOM_BASE_URL}/chat/completions`, async ({ request }) => {
        const body = await request.json();
        bodies.push(body);
        if (body.response_format) {
          return HttpResponse.json(
            { error: { message: 'response_format is not supported' } },
            { status: 400 },
          );
        }
        return HttpResponse.json(answer);
      }),
    );
    const schema = { type: 'object' };
    const result = await custom.json({ system: 'Judge.', prompt: 'p', name: 'judgments', schema });

    expect(result).toEqual({
      data: { judgments: [{ id: 'a', match: true, confidence: 0.9 }] },
      model: 'gpt-5-mini',
      usage: { tokensSent: 50, tokensReceived: 20 },
    });
    expect(bodies[0].response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'judgments', schema, strict: true },
    });
    expect(bodies[1].response_format).toBeUndefined();
    expect(bodies[1].messages[0].content).toMatch(/Answer with JSON only/);
  });

  it('goes straight to asking in words for models without JSON schemas', async () => {
    let calls = 0;
    server.use(
      http.post(`${CUSTOM_BASE_URL}/chat/completions`, () => {
        calls += 1;
        return HttpResponse.json({ choices: [{ message: { content: '{"ok":true}' } }] });
      }),
    );
    const plain = createOpenAiCompatibleAdapter({
      provider: 'custom',
      baseUrl: CUSTOM_BASE_URL,
      apiKey: TEST_KEYS.custom,
      model: 'small',
      traits: { json: false },
    });
    const result = await plain.json({ system: 's', prompt: 'p', name: 'x', schema: {} });
    expect(result).toEqual({ data: { ok: true }, model: 'small', usage: null });
    expect(calls).toBe(1);
  });

  it('reports refusals, other failures and unreadable JSON answers', async () => {
    const answer = (/** @type {any} */ body) =>
      http.post(`${CUSTOM_BASE_URL}/chat/completions`, () => HttpResponse.json(body));

    server.use(answer({ choices: [{ message: { refusal: 'I can’t help with that.' } }] }));
    expect(
      (await failure(() => custom.json({ system: 's', prompt: 'p', name: 'x', schema: {} }))).code,
    ).toBe('refused');
    server.use(answer({ choices: [] }));
    expect(
      (await failure(() => custom.json({ system: 's', prompt: 'p', name: 'x', schema: {} }))).code,
    ).toBe('bad-response');
    server.use(
      http.post(`${CUSTOM_BASE_URL}/chat/completions`, () =>
        HttpResponse.json({ error: { message: 'Down' } }, { status: 503 }),
      ),
    );
    expect(
      (await failure(() => custom.json({ system: 's', prompt: 'p', name: 'x', schema: {} }))).code,
    ).toBe('server');
  });
});

describe('The decision adapter (Jev)', () => {
  it('checks a TypeSafe key against its model list (recorded)', async () => {
    await createDecisionAdapter({ provider: 'typesafe', apiKey: TEST_KEYS.typesafe }).check();
    const error = await failure(() =>
      createDecisionAdapter({ provider: 'typesafe', apiKey: 'wrong' }).check(),
    );
    expect(error.code).toBe('auth');
    expect(error.detail).toBe('Invalid API key');

    server.use(
      http.get('https://api.typesafe.ai/v1/models', () => HttpResponse.json({ models: [] })),
    );
    expect(
      (
        await failure(() =>
          createDecisionAdapter({ provider: 'typesafe', apiKey: TEST_KEYS.typesafe }).check(),
        )
      ).code,
    ).toBe('bad-response');
  });

  it('checks an OpenRouter key without spending anything', async () => {
    await createDecisionAdapter({ provider: 'openrouter', apiKey: TEST_KEYS.openrouter }).check();
    expect(
      (
        await failure(() =>
          createDecisionAdapter({ provider: 'openrouter', apiKey: 'wrong' }).check(),
        )
      ).code,
    ).toBe('auth');
  });

  it('asks one yes/no question per story in one request (recorded)', async () => {
    /** @type {any} */
    let sent = null;
    server.use(
      http.post('https://api.typesafe.ai/v1/systemone', async ({ request }) => {
        sent = { body: await request.json(), auth: request.headers.get('authorization') };
        return HttpResponse.json(recorded('jev-systemone.json'));
      }),
    );
    const jev = createDecisionAdapter({ provider: 'typesafe', apiKey: TEST_KEYS.typesafe });
    const result = await jev.judge({
      question: 'Event announcements and conference promotions',
      items: [
        { id: 's1', text: 'Get your tickets for Founder Summit 2026' },
        { id: 's2', text: 'Startup raises $40M' },
        { id: 's3', text: 'Five takeaways from the AI conference' },
        { id: 's4', text: 'Not answered' },
      ],
    });

    expect(result).toEqual({
      judgments: [
        { id: 's1', confidence: 0.97 },
        { id: 's2', confidence: 0.03 },
        { id: 's3', confidence: 0.53 },
      ],
      model: 'jev-1.14.0',
      usage: { tokensSent: 377, tokensReceived: 55 },
    });
    expect(sent.auth).toBe(`Bearer ${TEST_KEYS.typesafe}`);
    expect(sent.body.model).toBe('jev-latest');
    expect(sent.body.state.stories.s1).toBe('Get your tickets for Founder Summit 2026');
    expect(sent.body.questions.s2).toEqual({
      type: 'noul',
      instructions: 'Story s2 matches the rule.',
    });
  });

  it('uses OpenRouter’s copy of the same API, and rejects odd answers', async () => {
    /** @type {string|null} */
    let model = null;
    server.use(
      http.post('https://openrouter.ai/api/v1/systemone', async ({ request }) => {
        model = /** @type {any} */ (await request.json()).model;
        return HttpResponse.json({
          answers: { a: { type: 'noul', noul: 1.4 }, b: { type: 'noul', noul: 0.2 } },
        });
      }),
    );
    const jev = createDecisionAdapter({ provider: 'openrouter', apiKey: TEST_KEYS.openrouter });
    const result = await jev.judge({
      question: 'q',
      items: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
    });
    expect(model).toBe('~typesafe/jev-latest');
    expect(result).toEqual({
      judgments: [{ id: 'b', confidence: 0.2 }],
      model: '~typesafe/jev-latest',
      usage: null,
    });

    server.use(
      http.post('https://openrouter.ai/api/v1/systemone', () => HttpResponse.json({ nope: true })),
    );
    expect((await failure(() => jev.judge({ question: 'q', items: [] }))).code).toBe(
      'bad-response',
    );
  });
});

describe('Reading streams and JSON', () => {
  it('finds the data lines in an event stream', async () => {
    /** @type {string[]} */
    const lines = [];
    for await (const line of eventData(
      trickle('event: x\ndata: one\n\n: comment\ndata:two\r\n\r\ndata: three', 3),
    )) {
      lines.push(line);
    }
    expect(lines).toEqual(['one', 'two', 'three']);
  });

  it('pulls JSON out of a fenced answer', () => {
    expect(parseJsonAnswer('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => parseJsonAnswer('{"a":')).toThrow(AiError);
    expect(() => parseJsonAnswer('no braces')).toThrow(AiError);
  });
});
