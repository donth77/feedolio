import { createSlice } from '@reduxjs/toolkit';
import { persistedStateHydrated } from '../../app/actions.js';
import { cleanBaseUrl, DECISION_PROVIDERS, GENERAL_PROVIDERS } from './providerInfo.js';

/**
 * How the reader set up AI, saved with their other data. Never holds a key:
 * keys live apart, in keys.js.
 *
 * @typedef {import('./providerInfo.js').GeneralProvider} GeneralProvider
 * @typedef {import('./providerInfo.js').DecisionProvider} DecisionProvider
 * @typedef {import('./types.js').ModelTraits} ModelTraits
 *
 * @typedef {Object} GeneralSettings
 * @property {GeneralProvider} provider
 * @property {string} baseUrl
 * @property {string} model
 * @property {ModelTraits} traits
 *
 * @typedef {{ provider: DecisionProvider }} DecisionSettings
 *
 * @typedef {{ actions: boolean, rules: boolean, catchUp: boolean }} AiFeatures
 *
 * @typedef {Object} AiSettings
 * @property {GeneralSettings|null} general   Set once a connection worked
 * @property {DecisionSettings|null} decision
 * @property {AiFeatures} features
 * @property {string} translateTo   A language code, e.g. "es"
 * @property {boolean} rememberKeys false: keys last only as long as the tab
 */

/** Languages Translate offers, by code. Their names come from the browser. */
export const LANGUAGES = /** @type {const} */ ([
  'ar',
  'de',
  'en',
  'es',
  'fr',
  'hi',
  'it',
  'ja',
  'ko',
  'nl',
  'pl',
  'pt',
  'ru',
  'sv',
  'tr',
  'uk',
  'zh',
]);

/** The reader's own language, when Translate offers it. */
function browserLanguage() {
  const code = globalThis.navigator?.language?.slice(0, 2).toLowerCase() ?? 'en';
  return LANGUAGES.includes(/** @type {any} */ (code)) ? code : 'en';
}

/** @returns {AiSettings} */
export function defaultAiSettings() {
  return {
    general: null,
    decision: null,
    features: { actions: true, rules: true, catchUp: true },
    translateTo: browserLanguage(),
    rememberKeys: true,
  };
}

/** @param {unknown} value @returns {value is Record<string, any>} */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** @param {unknown} saved @returns {ModelTraits} */
function restoreTraits(saved) {
  if (!isObject(saved)) return {};
  /** @type {ModelTraits} */
  const traits = {};
  if (typeof saved.effort === 'boolean') traits.effort = saved.effort;
  if (typeof saved.json === 'boolean') traits.json = saved.json;
  if (Number.isInteger(saved.maxOutput) && saved.maxOutput > 0) traits.maxOutput = saved.maxOutput;
  return traits;
}

/** @param {unknown} saved @returns {GeneralSettings|null} */
function restoreGeneral(saved) {
  if (!isObject(saved) || !(saved.provider in GENERAL_PROVIDERS)) return null;
  const provider = /** @type {GeneralProvider} */ (saved.provider);
  const info = GENERAL_PROVIDERS[provider];
  const baseUrl = info.editableUrl ? cleanBaseUrl(String(saved.baseUrl ?? '')) : info.baseUrl;
  if (!baseUrl || typeof saved.model !== 'string' || !saved.model) return null;
  return { provider, baseUrl, model: saved.model, traits: restoreTraits(saved.traits) };
}

/**
 * Settings from saved data, keeping only what's still valid.
 *
 * @param {unknown} [saved]
 * @returns {AiSettings}
 */
export function restoreAiSettings(saved) {
  const fallback = defaultAiSettings();
  if (!isObject(saved)) return fallback;
  const features = isObject(saved.features) ? saved.features : {};
  return {
    general: restoreGeneral(saved.general),
    decision:
      isObject(saved.decision) && saved.decision.provider in DECISION_PROVIDERS
        ? { provider: saved.decision.provider }
        : null,
    features: {
      actions: features.actions !== false,
      rules: features.rules !== false,
      catchUp: features.catchUp !== false,
    },
    translateTo: LANGUAGES.includes(saved.translateTo) ? saved.translateTo : fallback.translateTo,
    rememberKeys: saved.rememberKeys !== false,
  };
}

const aiSettingsSlice = createSlice({
  name: 'aiSettings',
  initialState: defaultAiSettings,
  reducers: {
    /**
     * A general model connected: Feedolio uses it from now on.
     *
     * @param {{ payload: GeneralSettings }} action
     */
    generalSaved(state, { payload }) {
      state.general = restoreGeneral(payload);
    },
    /** @param {{ payload: { model: string, traits: ModelTraits } }} action */
    generalModelChosen(state, { payload }) {
      if (!state.general || !payload.model) return;
      state.general.model = payload.model;
      state.general.traits = restoreTraits(payload.traits);
    },
    /** @param {{ payload: DecisionProvider }} action */
    decisionSaved(state, { payload }) {
      if (payload in DECISION_PROVIDERS) state.decision = { provider: payload };
    },
    decisionRemoved(state) {
      state.decision = null;
    },
    /** @param {{ payload: keyof AiFeatures }} action */
    featureToggled(state, { payload }) {
      if (payload in state.features) state.features[payload] = !state.features[payload];
    },
    /** @param {{ payload: string }} action */
    translateToChanged(state, { payload }) {
      if (LANGUAGES.includes(/** @type {any} */ (payload))) state.translateTo = payload;
    },
    /** @param {{ payload: boolean }} action */
    rememberKeysChanged(state, { payload }) {
      state.rememberKeys = payload;
    },
    /** Every key was removed: AI is off until the reader connects again. Rules stay. */
    aiReset(state) {
      state.general = null;
      state.decision = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(persistedStateHydrated, (_state, { payload }) =>
      restoreAiSettings(payload.aiSettings),
    );
  },
});

export const {
  generalSaved,
  generalModelChosen,
  decisionSaved,
  decisionRemoved,
  featureToggled,
  translateToChanged,
  rememberKeysChanged,
  aiReset,
} = aiSettingsSlice.actions;
export default aiSettingsSlice.reducer;

/** @param {{ aiSettings: AiSettings }} state */
export const selectAiSettings = (state) => state.aiSettings;
