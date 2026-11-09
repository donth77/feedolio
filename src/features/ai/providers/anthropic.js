import Anthropic from '@anthropic-ai/sdk';
import { AiError, errorForStatus, providerMessage, scrub } from '../errors.js';
import { GENERAL_PROVIDERS } from '../providerInfo.js';
import { parseJsonAnswer } from './http.js';

/**
 * Talks to Anthropic with the official SDK, from the browser. Browser mode is
 * safe here because the key is the reader's own and goes only to
 * api.anthropic.com (ADR-008). Loaded only when an Anthropic model is used.
 *
 * - Answers stream, and effort is set per task where the model takes it.
 * - JSON answers use structured output.
 * - A refusal is retried on Anthropic's recommended model for its category
 *   (server-side fallbacks); if that declines too, the reader is told.
 */

/** @typedef {import('../types.js').GeneralAdapter} GeneralAdapter */
/** @typedef {import('../types.js').ModelTraits} ModelTraits */

/** Retries a declined request on the model Anthropic recommends. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * @param {{ apiKey: string, model?: string, traits?: ModelTraits }} options
 * @returns {GeneralAdapter}
 */
export function createAnthropicAdapter({ apiKey, model = '', traits = {} }) {
  const client = new Anthropic({
    apiKey,
    // Only the reader's key, only to Anthropic: never a token or an address
    // the SDK might otherwise pick up from its surroundings.
    authToken: null,
    baseURL: GENERAL_PROVIDERS.anthropic.baseUrl,
    dangerouslyAllowBrowser: true,
  });

  /** @param {number} wanted */
  const outputLimit = (wanted) => Math.min(wanted, traits.maxOutput ?? wanted);

  /** @param {'low'|'medium'|'high'|undefined} effort */
  const effortFor = (effort) => (effort && traits.effort !== false ? { effort } : {});

  return {
    async listModels() {
      try {
        const models = [];
        const page = client.models.list({ limit: 100 }, { maxRetries: 0, timeout: 20_000 });
        for await (const info of page) {
          const capabilities = /** @type {Record<string, any>} */ (info.capabilities ?? {});
          models.push({
            id: info.id,
            label: info.display_name,
            traits: {
              effort: capabilities.effort?.supported === true,
              json: capabilities.structured_outputs?.supported === true,
              maxOutput: info.max_tokens ?? undefined,
            },
          });
        }
        return models;
      } catch (error) {
        throw toAiError(error, apiKey);
      }
    },

    async streamText({ system, prompt, effort, signal, onText }) {
      try {
        const stream = client.beta.messages.stream(
          {
            model,
            max_tokens: outputLimit(64_000),
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
            ...(effort && traits.effort !== false ? { output_config: effortFor(effort) } : {}),
            system,
            messages: [{ role: 'user', content: prompt }],
          },
          { signal },
        );
        if (onText) stream.on('text', onText);
        return finish(await stream.finalMessage());
      } catch (error) {
        throw toAiError(error, apiKey);
      }
    },

    async json({ system, prompt, schema, effort, signal }) {
      const structured = traits.json !== false;
      const outputConfig = {
        ...effortFor(effort),
        ...(structured ? { format: { type: /** @type {const} */ ('json_schema'), schema } } : {}),
      };
      try {
        const message = await client.beta.messages.create(
          {
            model,
            max_tokens: outputLimit(16_000),
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
            ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
            system: structured
              ? system
              : `${system}\n\nAnswer with JSON only, matching this JSON Schema:\n${JSON.stringify(schema)}`,
            messages: [{ role: 'user', content: prompt }],
          },
          { signal },
        );
        const { text, model: answeredBy, usage } = finish(message);
        return { data: parseJsonAnswer(text), model: answeredBy, usage };
      } catch (error) {
        throw toAiError(error, apiKey);
      }
    },
  };
}

/**
 * The text of a finished message. Checks for a refusal first: its content is
 * empty or cut short, and isn't an answer.
 *
 * @param {import('@anthropic-ai/sdk').default.Beta.Messages.BetaMessage} message
 */
function finish(message) {
  if (message.stop_reason === 'refusal') throw new AiError('refused');
  const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  return { text, model: message.model, usage: tokensOf(message.usage) };
}

/**
 * Tokens sent and received, across a fallback if there was one.
 *
 * @param {Record<string, any>} usage
 */
function tokensOf(usage) {
  /** @param {Record<string, any>} part */
  const sent = (part) =>
    (part.input_tokens ?? 0) +
    (part.cache_creation_input_tokens ?? 0) +
    (part.cache_read_input_tokens ?? 0);
  const parts =
    Array.isArray(usage?.iterations) && usage.iterations.length ? usage.iterations : [usage ?? {}];
  return {
    tokensSent: parts.reduce((total, part) => total + sent(part), 0),
    tokensReceived: parts.reduce((total, part) => total + (part.output_tokens ?? 0), 0),
  };
}

/**
 * The SDK's errors, as AiErrors without the key in them.
 *
 * @param {unknown} error
 * @param {string} key
 */
function toAiError(error, key) {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.APIUserAbortError) return new AiError('aborted');
  if (error instanceof Anthropic.APIConnectionError) return new AiError('network');
  if (error instanceof Anthropic.APIError && typeof error.status === 'number') {
    return errorForStatus(error.status, scrub(providerMessage(error.error), key));
  }
  return new AiError('bad-response');
}
