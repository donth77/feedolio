import { AiError } from './errors.js';
import { getKey } from './keys.js';
import { JUDGE_SYSTEM, JUDGMENTS_SCHEMA, judgePrompt } from './prompts.js';
import { GENERAL_PROVIDERS } from './providerInfo.js';
import { estimateTokens, recordUsage } from './usage.js';

/**
 * Sends each AI task to the right model (§7.3): writing goes to the general
 * model; yes/no and scoring go to the decision model when the reader has one,
 * and to the general model otherwise. Each provider's code loads only when
 * it's first used, and every request is counted for Settings › AI.
 */

/** @typedef {import('./aiSettingsSlice.js').AiSettings} AiSettings */
/** @typedef {import('./providerInfo.js').GeneralProvider} GeneralProvider */
/** @typedef {import('./providerInfo.js').DecisionProvider} DecisionProvider */
/** @typedef {import('./prompts.js').PromptStory} PromptStory */
/** @typedef {import('./types.js').TextRequest} TextRequest */
/** @typedef {import('./types.js').TokenCount} TokenCount */
/** @typedef {{ settings: AiSettings, userId: string|null }} AiContext */
/** @typedef {'summarize'|'translate'|'explain'|'match'|'rank'|'group'|'digest'} AiTask */

/** @type {Record<AiTask, 'general'|'decision'>} */
export const TASK_ROLES = {
  summarize: 'general',
  translate: 'general',
  explain: 'general',
  match: 'decision',
  rank: 'decision',
  group: 'general',
  digest: 'general',
};

/**
 * Whether a model is ready: set up, with its key where it needs one.
 *
 * @param {'general'|'decision'} role
 * @param {AiContext} context
 */
export function isReady(role, { settings, userId }) {
  if (role === 'decision') return Boolean(settings.decision && getKey(userId, 'decision'));
  const general = settings.general;
  if (!general) return false;
  return (
    GENERAL_PROVIDERS[general.provider].key !== 'required' || Boolean(getKey(userId, 'general'))
  );
}

/**
 * Which model runs a task now, or null when AI isn't set up.
 *
 * @param {AiTask} task
 * @param {AiContext} context
 * @returns {'general'|'decision'|null}
 */
export function roleFor(task, context) {
  if (TASK_ROLES[task] === 'decision' && isReady('decision', context)) return 'decision';
  return isReady('general', context) ? 'general' : null;
}

/**
 * An adapter for a general model, with its code loaded on first use.
 *
 * @param {{ provider: GeneralProvider, baseUrl: string, key: string|null, model?: string, traits?: import('./types.js').ModelTraits }} options
 */
async function loadGeneral({ provider, baseUrl, key, model, traits }) {
  if (provider === 'anthropic') {
    const { createAnthropicAdapter } = await import('./providers/anthropic.js');
    return createAnthropicAdapter({ apiKey: key ?? '', model, traits });
  }
  const { createOpenAiCompatibleAdapter } = await import('./providers/openaiCompatible.js');
  return createOpenAiCompatibleAdapter({ provider, baseUrl, apiKey: key, model, traits });
}

/** @param {AiContext} context */
async function generalAdapter({ settings, userId }) {
  const general = settings.general;
  if (!general || !isReady('general', { settings, userId })) throw new AiError('setup');
  return loadGeneral({ ...general, key: getKey(userId, 'general') });
}

/**
 * Tries a general connection the reader is setting up, and lists its models.
 *
 * @param {{ provider: GeneralProvider, baseUrl: string, key: string|null }} connection
 */
export async function testGeneral(connection) {
  const started = performance.now();
  const adapter = await loadGeneral(connection);
  const models = await adapter.listModels();
  return { models, ms: Math.round(performance.now() - started) };
}

/**
 * Tries a decision model's key.
 *
 * @param {{ provider: DecisionProvider, key: string }} connection
 */
export async function testDecision({ provider, key }) {
  const started = performance.now();
  const { createDecisionAdapter } = await import('./providers/decision.js');
  await createDecisionAdapter({ provider, apiKey: key }).check();
  return { ms: Math.round(performance.now() - started) };
}

/**
 * Writes an answer with the general model, streaming it as it comes.
 *
 * @param {TextRequest} request
 * @param {AiContext} context
 */
export async function generate(request, context) {
  const adapter = await generalAdapter(context);
  const result = await adapter.streamText(request);
  count(result.usage, request.system + request.prompt, result.text);
  return result;
}

/**
 * How likely a rule is to match each story, from 0 to 1. The decision
 * model's confidence is calibrated; the general model's is self-reported, so
 * callers use a wider "Maybe" band for it (ADR-008).
 *
 * @param {{ rule: string, stories: PromptStory[], signal?: AbortSignal }} request
 * @param {AiContext} context
 * @returns {Promise<{ judgments: { id: string, confidence: number }[], by: 'decision'|'general', model: string }>}
 */
export async function judge({ rule, stories, signal }, context) {
  const role = roleFor('match', context);
  if (!role) throw new AiError('setup');
  const known = new Set(stories.map((story) => story.id));

  if (role === 'decision' && context.settings.decision) {
    const { createDecisionAdapter } = await import('./providers/decision.js');
    const adapter = createDecisionAdapter({
      provider: context.settings.decision.provider,
      apiKey: getKey(context.userId, 'decision') ?? '',
    });
    const items = stories.map((story) => ({
      id: story.id,
      text: [story.title, story.text].filter(Boolean).join('\n\n'),
    }));
    const result = await adapter.judge({ question: rule, items, signal });
    count(result.usage, rule + items.map((item) => item.text).join(''), '');
    return {
      judgments: result.judgments.filter((judgment) => known.has(judgment.id)),
      by: 'decision',
      model: result.model,
    };
  }

  const adapter = await generalAdapter(context);
  const prompt = judgePrompt(rule, stories);
  const result = await adapter.json({
    system: JUDGE_SYSTEM,
    prompt,
    name: 'judgments',
    schema: JUDGMENTS_SCHEMA,
    effort: 'low',
    signal,
  });
  count(result.usage, JUDGE_SYSTEM + prompt, JSON.stringify(result.data));
  const answers = Array.isArray(result.data?.judgments) ? result.data.judgments : [];
  /** @type {Map<string, number>} */
  const judgments = new Map();
  for (const answer of answers) {
    if (!known.has(answer?.id) || judgments.has(answer.id)) continue;
    if (typeof answer.match !== 'boolean' || typeof answer.confidence !== 'number') continue;
    const sure = Math.min(1, Math.max(0, answer.confidence));
    judgments.set(answer.id, answer.match ? sure : 1 - sure);
  }
  return {
    judgments: [...judgments].map(([id, confidence]) => ({ id, confidence })),
    by: 'general',
    model: result.model,
  };
}

/**
 * Adds a request to this session's usage, estimating tokens when the provider
 * didn't report them.
 *
 * @param {TokenCount|null} usage
 * @param {string} sent
 * @param {string} received
 */
function count(usage, sent, received) {
  recordUsage(
    usage ?? { tokensSent: estimateTokens(sent), tokensReceived: estimateTokens(received) },
  );
}
