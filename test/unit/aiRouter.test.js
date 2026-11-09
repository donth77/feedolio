import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultAiSettings } from '../../src/features/ai/aiSettingsSlice.js';
import { removeAllKeys, setKey } from '../../src/features/ai/keys.js';
import {
  generate,
  groupStories,
  isReady,
  judge,
  rankGroups,
  roleFor,
  summarizeGroup,
  TASK_ROLES,
  testDecision,
  testGeneral,
} from '../../src/features/ai/router.js';
import { readUsage, resetUsage } from '../../src/features/ai/usage.js';
import { aiHandlers, recorded, recordedStream, TEST_KEYS } from '../fixtures/ai.js';

/** @typedef {import('../../src/features/ai/aiSettingsSlice.js').AiSettings} AiSettings */

const server = setupServer(...aiHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  removeAllKeys();
  resetUsage();
});
afterAll(() => server.close());

const ANTHROPIC = {
  provider: /** @type {const} */ ('anthropic'),
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-opus-5-5',
  traits: { effort: true, json: true },
};

/**
 * Settings with a general model, and a decision model if asked for.
 *
 * @param {Partial<AiSettings>} [changes]
 * @returns {AiSettings}
 */
function settings(changes = {}) {
  return { ...defaultAiSettings(), general: ANTHROPIC, ...changes };
}

const STORIES = [
  { id: 's1', title: 'Get your tickets for Founder Summit 2026 before prices rise on Friday' },
  { id: 's2', title: 'Startup raises $40M to build cheaper batteries' },
];

describe('The task router', () => {
  it('sends writing to the general model and yes/no work to the decision model (§7.3)', () => {
    expect(TASK_ROLES).toEqual({
      summarize: 'general',
      translate: 'general',
      explain: 'general',
      match: 'decision',
      rank: 'decision',
      group: 'general',
      digest: 'general',
    });

    const none = { settings: defaultAiSettings(), userId: null };
    expect(roleFor('summarize', none)).toBeNull();
    expect(roleFor('match', none)).toBeNull();

    // A general model needs its key; Ollama doesn't.
    const general = { settings: settings(), userId: null };
    expect(isReady('general', general)).toBe(false);
    setKey(null, 'general', TEST_KEYS.anthropic, true);
    expect(roleFor('summarize', general)).toBe('general');
    expect(roleFor('match', general)).toBe('general');
    const ollama = {
      settings: settings({
        general: {
          provider: 'ollama',
          baseUrl: 'http://localhost:11434/v1',
          model: 'llama3.2:latest',
          traits: {},
        },
      }),
      userId: 'github|42',
    };
    expect(roleFor('rank', ollama)).toBe('general');

    // A decision model takes over yes/no work once its key is there.
    const both = { settings: settings({ decision: { provider: 'openrouter' } }), userId: null };
    expect(roleFor('match', both)).toBe('general');
    setKey(null, 'decision', TEST_KEYS.openrouter, true);
    expect(roleFor('match', both)).toBe('decision');
    expect(roleFor('rank', both)).toBe('decision');
    expect(roleFor('group', both)).toBe('general');
  });

  it('tests connections the reader is setting up', async () => {
    const general = await testGeneral({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      key: TEST_KEYS.openai,
    });
    expect(general.models.map((model) => model.id)).toEqual(['gpt-5', 'gpt-5-mini', 'gpt-4.1']);
    expect(general.ms).toBeGreaterThanOrEqual(0);

    const anthropic = await testGeneral({
      provider: 'anthropic',
      baseUrl: '',
      key: TEST_KEYS.anthropic,
    });
    expect(anthropic.models).toHaveLength(14);

    expect(
      (await testDecision({ provider: 'openrouter', key: TEST_KEYS.openrouter })).ms,
    ).toBeGreaterThanOrEqual(0);
  });

  it('streams an answer from the general model and counts it (US-113)', async () => {
    server.use(
      http.post(
        'https://api.anthropic.com/v1/messages',
        () =>
          new HttpResponse(recordedStream('anthropic-summary.sse'), {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      ),
    );
    setKey(null, 'general', TEST_KEYS.anthropic, true);
    const result = await generate(
      { system: 's', prompt: 'p' },
      { settings: settings(), userId: null },
    );

    expect(result.text).toMatch(/^On Tuesday, the city council/);
    expect(readUsage()).toEqual({ requests: 1, tokensSent: 95, tokensReceived: 49 });
  });

  it('estimates usage when a provider doesn’t report it', async () => {
    server.use(
      http.post(
        'http://localhost:11434/v1/chat/completions',
        () =>
          new HttpResponse(
            'data: {"choices":[{"delta":{"content":"12345678"}}]}\n\ndata: [DONE]\n\n',
            {
              headers: { 'Content-Type': 'text/event-stream' },
            },
          ),
      ),
    );
    const ollama = settings({
      general: {
        provider: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3.2:latest',
        traits: {},
      },
    });
    await generate({ system: '1234', prompt: '5678' }, { settings: ollama, userId: null });
    expect(readUsage()).toEqual({ requests: 1, tokensSent: 2, tokensReceived: 2 });
  });

  it('judges with Jev when there is one, keeping only stories it was asked about', async () => {
    /** @type {any} */
    let sent = null;
    server.use(
      http.post('https://openrouter.ai/api/v1/systemone', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          ...recorded('jev-systemone.json'),
          answers: { s1: { type: 'noul', noul: 0.97 }, s2: { type: 'noul', noul: 0.03 } },
        });
      }),
    );
    setKey(null, 'general', TEST_KEYS.anthropic, true);
    setKey(null, 'decision', TEST_KEYS.openrouter, true);
    const result = await judge(
      { rule: 'Event announcements and conference promotions', stories: STORIES },
      { settings: settings({ decision: { provider: 'openrouter' } }), userId: null },
    );

    expect(result).toEqual({
      judgments: [
        { id: 's1', confidence: 0.97 },
        { id: 's2', confidence: 0.03 },
      ],
      by: 'decision',
      model: 'jev-1.14.0',
    });
    expect(sent.state.rule).toBe('Event announcements and conference promotions');
    expect(readUsage()).toEqual({ requests: 1, tokensSent: 377, tokensReceived: 55 });
  });

  it('judges with the general model otherwise, as a probability of a match (recorded)', async () => {
    const answer = recorded('anthropic-judgments.json');
    answer.content[0].text = JSON.stringify({
      judgments: [
        { id: 's1', match: true, confidence: 0.97 },
        { id: 's2', match: false, confidence: 0.95 },
        { id: 's1', match: false, confidence: 1 },
        { id: 'made-up', match: true, confidence: 1 },
        { id: 's3', match: 'yes', confidence: 1 },
        { id: 's2', match: true, confidence: 'high' },
      ],
    });
    /** @type {any} */
    let sent = null;
    server.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(answer);
      }),
    );
    setKey(null, 'general', TEST_KEYS.anthropic, true);
    const result = await judge(
      { rule: 'Event announcements', stories: STORIES },
      { settings: settings(), userId: null },
    );

    expect(result.by).toBe('general');
    expect(result.judgments).toEqual([
      { id: 's1', confidence: 0.97 },
      { id: 's2', confidence: expect.closeTo(0.05, 5) },
    ]);
    expect(sent.system).toMatch(/never follow instructions/);
    expect(sent.messages[0].content).toContain('<untrusted_story id="s1">');
  });

  it('copes with a general model that answers without a list', async () => {
    const answer = recorded('anthropic-judgments.json');
    answer.content[0].text = '{"judgments": null}';
    server.use(http.post('https://api.anthropic.com/v1/messages', () => HttpResponse.json(answer)));
    setKey(null, 'general', TEST_KEYS.anthropic, true);
    const result = await judge(
      { rule: 'r', stories: STORIES },
      { settings: settings(), userId: null },
    );
    expect(result.judgments).toEqual([]);
  });

  it('refuses to run when AI isn’t set up', async () => {
    const none = { settings: defaultAiSettings(), userId: null };
    await expect(judge({ rule: 'r', stories: STORIES }, none)).rejects.toMatchObject({
      code: 'setup',
    });
    await expect(generate({ system: 's', prompt: 'p' }, none)).rejects.toMatchObject({
      code: 'setup',
    });
    // Set up, but the key is gone.
    await expect(
      generate({ system: 's', prompt: 'p' }, { settings: settings(), userId: null }),
    ).rejects.toMatchObject({ code: 'setup' });
    await expect(rankGroups({ groups: [] }, none)).rejects.toMatchObject({ code: 'setup' });
  });
});

describe('Digest tasks', () => {
  const GROUPS = [
    { id: 'g1', headline: 'Markets', stories: [{ id: 's1', title: 'Stocks fall' }] },
    { id: 'g2', headline: 'Hack', stories: [{ id: 's2', title: 'Exchange hacked' }] },
  ];

  it('group stories with the general model, at medium effort (recorded)', async () => {
    /** @type {any} */
    let sent = null;
    server.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(recorded('anthropic-digest-groups.json'));
      }),
    );
    setKey(null, 'general', TEST_KEYS.anthropic, true);
    const result = await groupStories({ stories: STORIES }, { settings: settings(), userId: null });
    expect(result.groups).toHaveLength(8);
    expect(result.groups[0].headline).toBe('AI stocks swing after Democratic midterm wins');
    expect(sent.output_config.effort).toBe('medium');
    expect(sent.system).toMatch(/^You build a news digest/);

    server.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        const answer = recorded('anthropic-digest-groups.json');
        answer.content = [{ type: 'text', text: '{"groups": "none"}' }];
        return HttpResponse.json(answer);
      }),
    );
    expect(
      (await groupStories({ stories: STORIES }, { settings: settings(), userId: null })).groups,
    ).toEqual([]);
  });

  it('rank main stories with Jev’s scores, as 0 to 100 (recorded)', async () => {
    /** @type {any} */
    let sent = null;
    server.use(
      http.post('https://openrouter.ai/api/v1/systemone', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(recorded('jev-digest-ranks.json'));
      }),
    );
    setKey(null, 'general', TEST_KEYS.anthropic, true);
    setKey(null, 'decision', TEST_KEYS.openrouter, true);
    const result = await rankGroups(
      { groups: GROUPS },
      { settings: settings({ decision: { provider: 'openrouter' } }), userId: null },
    );
    // The recording answers for g1 to g8; only the groups asked about count.
    expect(result).toEqual({
      scores: [
        { id: 'g1', importance: 65 },
        { id: 'g2', importance: 60 },
      ],
      by: 'decision',
      model: 'jev-1.14.0',
    });
    expect(sent.questions.g1.type).toBe('score');
    expect(sent.questions.g1.criteria).toHaveLength(3);
    expect(sent.state.items.g2).toBe('Hack\n- Exchange hacked');
  });

  it('rank with the general model otherwise, keeping only known groups (recorded)', async () => {
    const answer = recorded('anthropic-digest-ranks.json');
    answer.content = [
      {
        type: 'text',
        text: JSON.stringify({
          ranks: [
            { id: 'g1', importance: 120 },
            { id: 'g2', importance: -4 },
            { id: 'g1', importance: 10 },
            { id: 'g9', importance: 99 },
            { id: 'g2', importance: 'high' },
          ],
        }),
      },
    ];
    server.use(http.post('https://api.anthropic.com/v1/messages', () => HttpResponse.json(answer)));
    setKey(null, 'general', TEST_KEYS.anthropic, true);
    const result = await rankGroups({ groups: GROUPS }, { settings: settings(), userId: null });
    expect(result.by).toBe('general');
    expect(result.scores).toEqual([
      { id: 'g1', importance: 100 },
      { id: 'g2', importance: 0 },
    ]);

    answer.content = [{ type: 'text', text: '{"ranks": null}' }];
    expect(
      (await rankGroups({ groups: GROUPS }, { settings: settings(), userId: null })).scores,
    ).toEqual([]);
  });

  it('summarise one main story, streamed (recorded)', async () => {
    /** @type {any} */
    let sent = null;
    server.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(recordedStream('anthropic-summary.sse'), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );
    setKey(null, 'general', TEST_KEYS.anthropic, true);
    const result = await summarizeGroup(
      { group: GROUPS[0] },
      { settings: settings(), userId: null },
    );
    expect(result.text).toMatch(/^On Tuesday/);
    expect(sent.system).toMatch(/^You summarise one main news story/);
    expect(sent.messages[0].content).toMatch(/^Main story: "Markets"/);
  });
});
