import { createSlice, nanoid } from '@reduxjs/toolkit';

/**
 * The one message at the bottom of the screen, such as "Removed from Saved"
 * with Undo, or a storage warning. A new message replaces the one showing.
 *
 * @typedef {Object} Toast
 * @property {string} id       New for every message, so its timer starts again
 * @property {string} message
 * @property {'info'|'warning'} tone
 * @property {import('@reduxjs/toolkit').UnknownAction} [undo]  Dispatched by the Undo button
 */

const toastSlice = createSlice({
  name: 'toast',
  initialState: /** @type {Toast|null} */ (null),
  reducers: {
    toastShown: {
      reducer: (_state, /** @type {{ payload: Toast }} */ { payload }) => payload,
      /**
       * @param {{ message: string, tone?: Toast['tone'], undo?: import('@reduxjs/toolkit').UnknownAction }} toast
       */
      prepare: ({ message, tone = 'info', undo }) => ({
        payload: { id: nanoid(), message, tone, ...(undo && { undo }) },
      }),
    },
    /** @param {{ payload: string }} action  The id of the toast to close */
    toastDismissed: (state, { payload }) => (state?.id === payload ? null : state),
  },
});

export const { toastShown, toastDismissed } = toastSlice.actions;
export default toastSlice.reducer;

/** @param {{ toast: Toast|null }} state */
export const selectToast = (state) => state.toast;
