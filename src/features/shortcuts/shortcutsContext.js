import { createContext, useContext } from 'react';

/** Opens the keyboard shortcuts overlay. */
export const ShortcutsContext = createContext(() => {});

/** @returns {() => void} */
export function useShowShortcuts() {
  return useContext(ShortcutsContext);
}
