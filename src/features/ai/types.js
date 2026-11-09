/**
 * Shapes shared by the AI adapters and the task router. JSDoc only.
 *
 * @typedef {Object} ModelTraits   What a model can do, from the provider's model list
 * @property {boolean} [effort]     Takes an effort level (Anthropic)
 * @property {boolean} [json]       Can be held to a JSON schema
 * @property {number} [maxOutput]   Most tokens it can write in one answer
 *
 * @typedef {Object} ModelSummary
 * @property {string} id
 * @property {string} label
 * @property {ModelTraits} traits
 *
 * @typedef {{ tokensSent: number, tokensReceived: number }} TokenCount
 *
 * @typedef {Object} TextRequest
 * @property {string} system
 * @property {string} prompt
 * @property {'low'|'medium'|'high'} [effort]
 * @property {AbortSignal} [signal]
 * @property {(delta: string) => void} [onText]   Called as each piece arrives
 *
 * @typedef {Object} TextResult
 * @property {string} text
 * @property {string} model        The model that answered
 * @property {TokenCount|null} usage
 *
 * @typedef {Object} JsonRequest
 * @property {string} system
 * @property {string} prompt
 * @property {string} name          Names the schema, for servers that ask
 * @property {Record<string, unknown>} schema   JSON Schema, every property required
 * @property {'low'|'medium'|'high'} [effort]
 * @property {AbortSignal} [signal]
 *
 * @typedef {Object} JsonResult
 * @property {any} data
 * @property {string} model
 * @property {TokenCount|null} usage
 *
 * @typedef {Object} GeneralAdapter
 * @property {() => Promise<ModelSummary[]>} listModels   Also proves the key works
 * @property {(request: TextRequest) => Promise<TextResult>} streamText
 * @property {(request: JsonRequest) => Promise<JsonResult>} json
 *
 * @typedef {Object} JudgeRequest   One yes/no question about each item
 * @property {string} question      e.g. the rule's text
 * @property {{ id: string, text: string }[]} items
 * @property {AbortSignal} [signal]
 *
 * @typedef {Object} JudgeResult
 * @property {{ id: string, confidence: number }[]} judgments   confidence: probability of yes, 0 to 1
 * @property {string} model
 * @property {TokenCount|null} usage
 *
 * @typedef {Object} ScoreRequest   One score on the same scale for each item
 * @property {string} question
 * @property {{ id: string, text: string }[]} items
 * @property {string[]} levels      The scale, least to most
 * @property {AbortSignal} [signal]
 *
 * @typedef {Object} ScoreResult
 * @property {{ id: string, importance: number }[]} scores   0 to 100
 * @property {string} model
 * @property {TokenCount|null} usage
 *
 * @typedef {Object} DecisionAdapter
 * @property {() => Promise<void>} check   Proves the key works
 * @property {(request: JudgeRequest) => Promise<JudgeResult>} judge
 * @property {(request: ScoreRequest) => Promise<ScoreResult>} score
 */

export {};
