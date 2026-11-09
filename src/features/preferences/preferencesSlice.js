import { createSlice } from '@reduxjs/toolkit';

/**
 * How the reader likes Feedolio to look. Remembered on this device.
 *
 * @typedef {Object} Preferences
 * @property {'system'|'light'|'dark'} theme
 * @property {'list'|'cards'} layout
 * @property {'comfortable'|'compact'} density
 * @property {{ size: 's'|'m'|'l'|'xl', font: 'serif'|'sans', width: 'narrow'|'wide' }} reading
 * @property {'auto'|'expanded'|'collapsed'} sidebar  'auto' = expanded from 1280 px, a rail at 1024–1279 px
 */

/** @type {Preferences} */
const initialState = {
  theme: 'system',
  layout: 'list',
  density: 'comfortable',
  reading: { size: 'm', font: 'serif', width: 'narrow' },
  sidebar: 'auto',
};

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {},
});

export default preferencesSlice.reducer;
