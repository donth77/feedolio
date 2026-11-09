import { AiError, errorForStatus, providerMessage, scrub } from '../errors.js';
import { call, eventData, isAbort, parseJsonAnswer, readJson } from './http.js';

/**
 * Talks to any server with OpenAI's chat completions API: OpenAI, OpenRouter,
 * Ollama on the reader's computer, or their own. Answers stream; JSON answers
 * use a JSON schema where the server takes one, and are checked either way.
 */

/** @typedef {import('../types.js').GeneralAdapter} GeneralAdapter */
/** @typedef {import('../types.js').ModelTraits} ModelTraits */
/** @typedef {import('../providerInfo.js').GeneralProvider} GeneralProvider */

/**
 * @param {{
 *   provider: GeneralProvider,
 *   baseUrl: string,
 *   apiKey?: string|null,
 *   model?: string,
 *   traits?: ModelTraits,
 * }} options
 * @returns {GeneralAdapter}
 */
export function createOpenAiCompatibleAdapter({
  provider,
  baseUrl,
  apiKey = null,
  model = '',
  traits = {},
}) {
  const key = apiKey || null;

  /** @param {{ role: string, content: string }[]} messages @param {AbortSignal} [signal] @param {Record<string, unknown>} [extra] */
  const complete = (messages, signal, extra = {}) =>
    call(`${baseUrl}/chat/completions`, {
      method: 'POST',
      key,
      signal,
      body: JSON.stringify({ model, messages, ...extra }),
    });

  return {
    async listModels() {
      const signal = AbortSignal.timeout(20_000);
      // OpenRouter lists models to anyone, so check the key on its own first.
      if (provider === 'openrouter') await call(`${baseUrl}/key`, { key, signal });
      const body = await readJson(await call(`${baseUrl}/models`, { key, signal }));
      const list = Array.isArray(body?.data) ? body.data : null;
      if (!list) throw new AiError('bad-response');
      return list
        .filter((/** @type {any} */ entry) => typeof entry?.id === 'string')
        .map((/** @type {any} */ entry) => ({
          id: entry.id,
          label: typeof entry.name === 'string' ? entry.name : entry.id,
          traits: { json: takesJsonSchema(entry) },
        }));
    },

    async streamText({ system, prompt, signal, onText }) {
      const response = await complete(
        [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        signal,
        { stream: true, stream_options: { include_usage: true } },
      );
      if (!response.body) throw new AiError('bad-response');

      let text = '';
      let answeredBy = model;
      /** @type {import('../types.js').TokenCount|null} */
      let usage = null;
      try {
        for await (const data of eventData(response.body)) {
          if (data === '[DONE]') break;
          let chunk;
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }
          // OpenRouter reports a failure part-way through as an error chunk.
          if (chunk.error) {
            throw errorForStatus(
              Number(chunk.error.code) || 500,
              scrub(providerMessage(chunk), key),
            );
          }
          if (typeof chunk.model === 'string') answeredBy = chunk.model;
          const choice = chunk.choices?.[0];
          const delta = choice?.delta?.content;
          if (typeof delta === 'string' && delta) {
            text += delta;
            onText?.(delta);
          }
          if (choice?.finish_reason === 'content_filter' || choice?.delta?.refusal) {
            throw new AiError('refused');
          }
          if (chunk.usage) usage = tokensOf(chunk.usage);
        }
      } catch (error) {
        if (error instanceof AiError) throw error;
        throw isAbort(error) ? new AiError('aborted') : new AiError('network');
      }
      return { text, model: answeredBy, usage };
    },

    async json({ system, prompt, name, schema, signal }) {
      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ];
      let body = null;
      if (traits.json !== false) {
        try {
          const format = { type: 'json_schema', json_schema: { name, schema, strict: true } };
          body = await readJson(await complete(messages, signal, { response_format: format }));
        } catch (error) {
          // Some servers don't take JSON schemas; ask in words instead.
          if (!(error instanceof AiError && error.code === 'request')) throw error;
        }
      }
      if (!body) {
        const asked = [
          {
            role: 'system',
            content: `${system}\n\nAnswer with JSON only, matching this JSON Schema:\n${JSON.stringify(schema)}`,
          },
          messages[1],
        ];
        body = await readJson(await complete(asked, signal));
      }
      const choice = body?.choices?.[0];
      if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal) {
        throw new AiError('refused');
      }
      const text = choice?.message?.content;
      if (typeof text !== 'string') throw new AiError('bad-response');
      return {
        data: parseJsonAnswer(text),
        model: typeof body.model === 'string' ? body.model : model,
        usage: body.usage ? tokensOf(body.usage) : null,
      };
    },
  };
}

/**
 * Whether a model takes a JSON schema. OpenRouter lists what each model
 * supports; other servers don't say, so the adapter tries and falls back.
 *
 * @param {Record<string, any>} entry
 */
function takesJsonSchema(entry) {
  const supported = entry.supported_parameters;
  if (!Array.isArray(supported)) return true;
  return supported.includes('structured_outputs') || supported.includes('response_format');
}

/** @param {Record<string, any>} usage */
function tokensOf(usage) {
  return {
    tokensSent: Number(usage.prompt_tokens) || 0,
    tokensReceived: Number(usage.completion_tokens) || 0,
  };
}
