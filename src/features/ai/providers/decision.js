import { AiError } from '../errors.js';
import { DECISION_PROVIDERS } from '../providerInfo.js';
import { call, readJson } from './http.js';

/**
 * Talks to TypeSafe's decision model, Jev, through its "System One" API:
 * TypeSafe's own, or OpenRouter's copy of it (same request format). Jev
 * answers yes/no ("noul") questions with a calibrated probability.
 *
 * Checked 2026-11-09: POST {base}/systemone with
 *   { model, state, questions: { <name>: { type: 'noul', instructions } } }
 * returns { model, answers: { <name>: { type: 'noul', noul: 0..1 } }, usage }.
 */

/** @typedef {import('../types.js').DecisionAdapter} DecisionAdapter */
/** @typedef {import('../providerInfo.js').DecisionProvider} DecisionProvider */

/**
 * @param {{ provider: DecisionProvider, apiKey: string }} options
 * @returns {DecisionAdapter}
 */
export function createDecisionAdapter({ provider, apiKey }) {
  const info = DECISION_PROVIDERS[provider];

  return {
    async check() {
      const signal = AbortSignal.timeout(20_000);
      if (provider === 'openrouter') {
        // The key check costs nothing; Jev's model list there is public.
        await call(`${info.baseUrl}/key`, { key: apiKey, signal });
        return;
      }
      const body = await readJson(await call(`${info.baseUrl}/models`, { key: apiKey, signal }));
      const names = Array.isArray(body?.models)
        ? body.models.map((/** @type {any} */ entry) => entry?.name)
        : [];
      if (!names.includes(info.model)) throw new AiError('bad-response');
    },

    async judge({ question, items, signal }) {
      // One request asks about every item: the items are the shared "state",
      // and each gets its own yes/no question, named by its id.
      const request = {
        model: info.model,
        state: {
          rule: question,
          stories: Object.fromEntries(items.map((item) => [item.id, item.text])),
        },
        questions: Object.fromEntries(
          items.map((item) => [
            item.id,
            { type: 'noul', instructions: `Story ${item.id} matches the rule.` },
          ]),
        ),
      };
      const body = await readJson(
        await call(`${info.baseUrl}/systemone`, {
          method: 'POST',
          key: apiKey,
          signal,
          body: JSON.stringify(request),
        }),
      );
      const answers = body?.answers;
      if (!answers || typeof answers !== 'object') throw new AiError('bad-response');
      const judgments = items.flatMap((item) => {
        const value = answers[item.id]?.noul;
        return typeof value === 'number' && value >= 0 && value <= 1
          ? [{ id: item.id, confidence: value }]
          : [];
      });
      return {
        judgments,
        model: typeof body.model === 'string' ? body.model : info.model,
        usage: body.usage
          ? {
              tokensSent: Number(body.usage.input_tokens) || 0,
              tokensReceived: Number(body.usage.output_tokens) || 0,
            }
          : null,
      };
    },
  };
}
