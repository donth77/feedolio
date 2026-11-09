import { createEntityAdapter, createSlice, nanoid } from '@reduxjs/toolkit';
import { persistedStateHydrated } from '../../../app/actions.js';

/**
 * The reader's filter rules (US-104 to US-108), saved with their other data.
 * Editing a rule bumps its version, so every story is checked again against
 * the new wording.
 *
 * @typedef {'hide'|'highlight'|'tag'} RuleAction
 *
 * @typedef {Object} Rule
 * @property {string} id
 * @property {string} text       Plain English, e.g. "Hide event announcements and conference promotions"
 * @property {RuleAction} action
 * @property {string|null} tag   For tag rules
 * @property {boolean} enabled
 * @property {number} version
 * @property {string} createdAt  ISO
 */

export const RULE_ACTIONS = /** @type {const} */ (['hide', 'highlight', 'tag']);
const MAX_TEXT = 300;
const MAX_TAG = 30;

const rulesAdapter = createEntityAdapter({
  /** @type {(a: Rule, b: Rule) => number} */
  sortComparer: (a, b) => a.createdAt.localeCompare(b.createdAt),
});

/**
 * A tag as the reader typed it, tidied, or null.
 *
 * @param {unknown} tag
 */
export function cleanTag(tag) {
  const clean = String(tag ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAG);
  return clean || null;
}

/** @param {unknown} value @returns {value is Rule} */
function isRule(value) {
  const rule = /** @type {Record<string, any>} */ (value);
  return (
    typeof rule === 'object' &&
    rule !== null &&
    typeof rule.id === 'string' &&
    typeof rule.text === 'string' &&
    rule.text.trim() !== '' &&
    RULE_ACTIONS.includes(rule.action) &&
    (rule.action !== 'tag' || cleanTag(rule.tag) !== null) &&
    typeof rule.enabled === 'boolean' &&
    Number.isInteger(rule.version) &&
    typeof rule.createdAt === 'string'
  );
}

/**
 * @param {{ text: string, action: RuleAction, tag?: string|null }} input
 */
function shape({ text, action, tag }) {
  return {
    text: text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT),
    action,
    tag: action === 'tag' ? cleanTag(tag) : null,
  };
}

/**
 * The rules state from saved data: { list, judged }. `judged` says whether
 * this account has judgments to load (they outlive the rules that made them).
 *
 * @param {unknown} [saved]
 */
export function restoreRules(saved) {
  const data = /** @type {{ list?: unknown, judged?: unknown }} */ (saved ?? {});
  const list = Array.isArray(data.list) ? data.list.filter(isRule) : [];
  return rulesAdapter.setAll(
    rulesAdapter.getInitialState({ judged: data.judged === true }),
    list.map((rule) => ({ ...rule, tag: rule.action === 'tag' ? cleanTag(rule.tag) : null })),
  );
}

const rulesSlice = createSlice({
  name: 'rules',
  initialState: rulesAdapter.getInitialState({ judged: false }),
  reducers: {
    ruleAdded: {
      reducer: rulesAdapter.addOne,
      /** @param {{ text: string, action: RuleAction, tag?: string|null }} input */
      prepare: (input) => ({
        payload: /** @type {Rule} */ ({
          id: nanoid(10),
          ...shape(input),
          enabled: true,
          version: 1,
          createdAt: new Date().toISOString(),
        }),
      }),
    },
    /** @param {{ payload: { id: string, text: string, action: RuleAction, tag?: string|null } }} action */
    ruleEdited(state, { payload }) {
      const rule = state.entities[payload.id];
      if (!rule) return;
      Object.assign(rule, shape(payload));
      rule.version += 1;
    },
    /** @param {{ payload: string }} action */
    ruleToggled(state, { payload }) {
      const rule = state.entities[payload];
      if (rule) rule.enabled = !rule.enabled;
    },
    ruleRemoved: rulesAdapter.removeOne,
    /** Undo for Remove. @param {{ payload: Rule }} action */
    ruleRestored(state, { payload }) {
      if (isRule(payload)) rulesAdapter.addOne(state, payload);
    },
    /** The first judgment was saved: there's something to load next time. */
    rulesJudged(state) {
      state.judged = true;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(persistedStateHydrated, (_state, { payload }) => restoreRules(payload.rules));
  },
});

export const { ruleAdded, ruleEdited, ruleToggled, ruleRemoved, ruleRestored, rulesJudged } =
  rulesSlice.actions;
export default rulesSlice.reducer;

const selectors = rulesAdapter.getSelectors(
  (/** @type {{ rules: ReturnType<typeof restoreRules> }} */ state) => state.rules,
);
export const selectAllRules = selectors.selectAll;
export const selectRuleEntities = selectors.selectEntities;

/** @param {{ rules: ReturnType<typeof restoreRules> }} state */
export const selectRulesJudged = (state) => state.rules.judged;
