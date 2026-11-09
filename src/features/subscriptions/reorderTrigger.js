/**
 * The first-page part of reordering feeds: notices a press or Alt+↑/↓ on a
 * feed and loads feedReorder.js to do the rest.
 *
 * @typedef {import('./feedReorder.js').Move} Move
 */

/** @type {Promise<typeof import('./feedReorder.js')> | null} */
let engine = null;
const load = () => (engine ??= import('./feedReorder.js'));

/**
 * A press on a feed in the sidebar: a drag with a mouse or pen. Touch keeps
 * scrolling the list; Settings has a grip and Move buttons for touch.
 *
 * @param {import('react').PointerEvent<HTMLElement>} event
 * @param {Move} move
 */
export function pressFeed(event, move) {
  if (event.button !== 0 || event.pointerType === 'touch') return;
  const list = event.currentTarget;
  const item = /** @type {HTMLElement|null} */ (
    /** @type {Element} */ (event.target).closest('[data-reorder-id]')
  );
  if (!item || item.parentElement !== list) return;
  const { pointerId, clientX: x, clientY: y } = event;
  void load().then(({ beginPointerDrag }) =>
    beginPointerDrag({ list, item, pointerId, x, y, move }),
  );
}

/**
 * Alt+↑ or Alt+↓ on a feed in the sidebar moves it one place.
 *
 * @param {import('react').KeyboardEvent<HTMLElement>} event
 * @param {Move} move
 */
export function stepFeed(event, move) {
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
  const list = event.currentTarget;
  const item = /** @type {HTMLElement|null} */ (
    /** @type {Element} */ (event.target).closest('[data-reorder-id]')
  );
  if (!item || item.parentElement !== list) return;
  event.preventDefault();
  const by = event.key === 'ArrowUp' ? -1 : 1;
  const label = item.dataset.reorderLabel ?? 'Feed';
  void load().then(({ moveByStep }) => moveByStep({ list, item, by, move, label }));
}
