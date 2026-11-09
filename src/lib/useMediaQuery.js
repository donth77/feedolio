import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, kept up to date as the window changes.
 * Where matchMedia isn't available, it answers `fallback`.
 *
 * @param {string} query  e.g. "(min-width: 1280px)"
 * @param {boolean} [fallback]
 */
export function useMediaQuery(query, fallback = false) {
  const subscribe = useCallback(
    (/** @type {() => void} */ onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const read = () =>
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback;
  return useSyncExternalStore(subscribe, read, () => fallback);
}
