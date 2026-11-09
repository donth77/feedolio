import { createContext, useContext } from 'react';

/** Opens the Add feed dialog from anywhere inside the app shell. */
export const AddFeedContext = createContext(() => {});

/** @returns {() => void} */
export function useOpenAddFeed() {
  return useContext(AddFeedContext);
}
