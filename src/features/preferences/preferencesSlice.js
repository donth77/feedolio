import { createSlice } from '@reduxjs/toolkit';
import { persistedStateHydrated } from '../../app/actions.js';

/**
 * How the reader likes Feedolio to look. Remembered on this device.
 *
 * @typedef {Object} Preferences
 * @property {'system'|'light'|'dark'} theme
 * @property {'list'|'cards'} layout
 * @property {'comfortable'|'compact'} density
 * @property {Reading} reading
 * @property {'auto'|'expanded'|'collapsed'} sidebar  'auto' = expanded from 1280 px, a rail at 1024–1279 px
 */

/**
 * @typedef {{ size: 's'|'m'|'l'|'xl', font: 'serif'|'sans', width: 'narrow'|'wide' }} Reading
 */

/** Allowed values, in the order controls show them. */
export const OPTIONS = {
  theme: /** @type {const} */ (['system', 'light', 'dark']),
  layout: /** @type {const} */ (['list', 'cards']),
  density: /** @type {const} */ (['comfortable', 'compact']),
  sidebar: /** @type {const} */ (['auto', 'expanded', 'collapsed']),
  size: /** @type {const} */ (['s', 'm', 'l', 'xl']),
  font: /** @type {const} */ (['serif', 'sans']),
  width: /** @type {const} */ (['narrow', 'wide']),
};

/** @type {Preferences} */
export const DEFAULT_PREFERENCES = {
  theme: 'system',
  layout: 'list',
  density: 'comfortable',
  reading: { size: 'm', font: 'serif', width: 'narrow' },
  sidebar: 'auto',
};

/**
 * @template {string} T
 * @param {readonly T[]} allowed
 * @param {unknown} value
 * @param {T} fallback
 * @returns {T}
 */
const oneOf = (allowed, value, fallback) =>
  allowed.includes(/** @type {T} */ (value)) ? /** @type {T} */ (value) : fallback;

/**
 * Preferences from saved data, keeping only values that are still valid.
 *
 * @param {Record<string, any>} [saved]
 * @returns {Preferences}
 */
export function restorePreferences(saved = {}) {
  const reading = saved.reading ?? {};
  const fallback = DEFAULT_PREFERENCES;
  return {
    theme: oneOf(OPTIONS.theme, saved.theme, fallback.theme),
    layout: oneOf(OPTIONS.layout, saved.layout, fallback.layout),
    density: oneOf(OPTIONS.density, saved.density, fallback.density),
    reading: {
      size: oneOf(OPTIONS.size, reading.size, fallback.reading.size),
      font: oneOf(OPTIONS.font, reading.font, fallback.reading.font),
      width: oneOf(OPTIONS.width, reading.width, fallback.reading.width),
    },
    sidebar: oneOf(OPTIONS.sidebar, saved.sidebar, fallback.sidebar),
  };
}

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState: DEFAULT_PREFERENCES,
  reducers: {
    /** @param {{ payload: Partial<Reading> }} action */
    readingChanged(state, { payload }) {
      state.reading = restorePreferences({ reading: { ...state.reading, ...payload } }).reading;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(persistedStateHydrated, (_state, { payload }) =>
      restorePreferences(payload.preferences),
    );
  },
});

export const { readingChanged } = preferencesSlice.actions;
export default preferencesSlice.reducer;

/** @param {{ preferences: Preferences }} state */
export const selectReading = (state) => state.preferences.reading;
