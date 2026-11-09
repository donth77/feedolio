import { useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';
import { selectAiSettings } from './aiSettingsSlice.js';
import { keysVersion, subscribeToKeys } from './keys.js';
import { isReady } from './router.js';
import { readUsage, subscribeToUsage } from './usage.js';

/** @typedef {import('./router.js').AiContext} AiContext */

/** @param {{ auth: { user: { id: string } | null } }} state */
const selectUserId = (state) => state.auth.user?.id ?? null;

/**
 * The current account's AI setup, updated when keys change here or in
 * another tab. AI is on once the general model is ready (US-114).
 *
 * @returns {AiContext & { generalReady: boolean, decisionReady: boolean }}
 */
export function useAiContext() {
  const settings = useSelector(selectAiSettings);
  const userId = useSelector(selectUserId);
  useSyncExternalStore(subscribeToKeys, keysVersion);
  const context = { settings, userId };
  return {
    ...context,
    generalReady: isReady('general', context),
    decisionReady: isReady('decision', context),
  };
}

/** This session's AI usage, kept current. */
export function useAiUsage() {
  return useSyncExternalStore(subscribeToUsage, readUsage);
}
