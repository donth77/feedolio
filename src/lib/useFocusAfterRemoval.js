import { useEffect, useRef } from 'react';

/**
 * Keeps keyboard focus in place when the list item holding it goes away.
 * Call the returned function with the item's index just before removing it.
 * Once the list has re-rendered, focus moves to the same control in the item
 * that took its place, or the one before it, or else to `fallback`.
 *
 * @param {import('react').RefObject<HTMLElement|null>} list
 * @param {string} selector  The control to focus in each item, e.g. "button[data-remove]"
 * @param {import('react').RefObject<HTMLElement|null>} fallback
 * @param {unknown} items  The list's items; focus moves when they change
 * @returns {(index: number) => void}
 */
export function useFocusAfterRemoval(list, selector, fallback, items) {
  const removed = useRef(/** @type {number|null} */ (null));

  useEffect(() => {
    const index = removed.current;
    if (index === null) return;
    removed.current = null;
    const controls = list.current?.querySelectorAll(selector) ?? [];
    const next = controls[Math.min(index, controls.length - 1)] ?? fallback.current;
    if (next instanceof HTMLElement) next.focus();
  }, [fallback, items, list, selector]);

  return (index) => {
    removed.current = index;
  };
}
