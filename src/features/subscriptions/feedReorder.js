import { flushSync } from 'react-dom';

/**
 * Reordering a list of feeds by dragging or from the keyboard. Loaded on first
 * use (see reorderTrigger.js), so it costs the first page nothing.
 *
 * A list is any element whose direct children carry data-reorder-id. While a
 * feed is dragged, the list reorders live as it passes the others, and the
 * dragged feed follows the pointer; Esc puts it back.
 *
 * @typedef {(id: string, to: number) => void} Move  Moves a feed to an index
 */

/** How far a press must travel before it's a drag rather than a click. */
const DRAG_DISTANCE = 5;
/** Within this distance of a scrolling edge, a drag scrolls. */
const EDGE = 40;

/**
 * Where a dragged item belongs: after every other item whose middle is above
 * the pointer.
 *
 * @param {number[]} middles  The other items' vertical middles, in order
 * @param {number} y  The pointer
 */
export function dropIndex(middles, y) {
  return middles.filter((middle) => middle < y).length;
}

/**
 * Starts watching a press on an item: a drag once it moves far enough (or at
 * once, from a grip), otherwise left to be a click.
 *
 * @param {{
 *   list: HTMLElement,
 *   item: HTMLElement,
 *   pointerId: number,
 *   x: number,
 *   y: number,
 *   move: Move,
 *   now?: boolean,
 * }} press  now: start dragging straight away (a grip)
 */
export function beginPointerDrag({ list, item, pointerId, x, y, move, now = false }) {
  const id = /** @type {string} */ (item.dataset.reorderId);
  const from = itemsOf(list).indexOf(item);
  let dragging = false;
  let current = from;
  let startTop = 0;

  const start = () => {
    dragging = true;
    startTop = item.getBoundingClientRect().top;
    list.dataset.reordering = '';
    item.dataset.dragging = '';
  };

  /** @param {PointerEvent} event */
  const onMove = (event) => {
    if (event.pointerId !== pointerId) return;
    // The press ended before this module loaded: it was a click.
    if ((event.buttons & 1) === 0) return finish(false);
    if (!dragging) {
      if (Math.hypot(event.clientX - x, event.clientY - y) < DRAG_DISTANCE) return;
      start();
    }
    event.preventDefault();
    const others = itemsOf(list).filter((other) => other !== item);
    const to = dropIndex(others.map(middleOf), event.clientY);
    if (to !== current) {
      flushSync(() => move(id, to));
      current = to;
    }
    // Follow the pointer from wherever the list now puts the item.
    item.style.transform = '';
    const natural = item.getBoundingClientRect().top;
    item.style.transform = `translateY(${startTop + event.clientY - y - natural}px)`;
    scrollNearEdge(list, event.clientY);
  };

  /** @param {boolean} cancelled */
  const finish = (cancelled) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey, true);
    if (!dragging) return;
    if (cancelled && current !== from) flushSync(() => move(id, from));
    item.style.transform = '';
    delete item.dataset.dragging;
    delete list.dataset.reordering;
    // The press that ends a drag isn't a click on whatever is under it.
    const swallow = (/** @type {MouseEvent} */ click) => {
      click.preventDefault();
      click.stopPropagation();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, true), 0);
  };
  /** @param {PointerEvent} event */
  const onUp = (event) => event.pointerId === pointerId && finish(false);
  /** @param {PointerEvent} event */
  const onCancel = (event) => event.pointerId === pointerId && finish(true);
  /** @param {KeyboardEvent} event */
  const onKey = (event) => {
    if (event.key !== 'Escape' || !dragging) return;
    event.preventDefault();
    event.stopPropagation();
    finish(true);
  };

  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey, true);
  if (now) start();
}

/**
 * Moves an item one place up or down from the keyboard, keeps focus on the
 * same control, and says where it went.
 *
 * @param {{
 *   list: HTMLElement,
 *   item: HTMLElement,
 *   by: -1|1,
 *   move: Move,
 *   label: string,
 *   focus?: string,
 * }} step  focus: a selector, inside the item, for the control to keep focused
 */
export function moveByStep({ list, item, by, move, label, focus }) {
  const items = itemsOf(list);
  const from = items.indexOf(item);
  const to = from + by;
  const id = /** @type {string} */ (item.dataset.reorderId);
  if (from === -1 || to < 0 || to >= items.length) {
    announce(`${label} is already ${by < 0 ? 'first' : 'last'}.`);
    return;
  }
  const focused = document.activeElement;
  flushSync(() => move(id, to));
  // Moving an element in the page can drop its focus; put it back.
  const moved = itemsOf(list).find((element) => element.dataset.reorderId === id);
  const target = focus ? moved?.querySelector(focus) : focused;
  if (target instanceof HTMLElement && document.activeElement !== target) target.focus();
  announce(`${label} moved to position ${to + 1} of ${items.length}.`);
}

/**
 * Says something to screen readers, through one polite live region.
 *
 * @param {string} text
 */
export function announce(text) {
  let region = document.getElementById('reorder-status');
  if (!region) {
    region = document.createElement('div');
    region.id = 'reorder-status';
    region.className = 'visually-hidden';
    region.setAttribute('role', 'status');
    document.body.append(region);
  }
  // A fresh change each time, so a repeated message is read again.
  region.textContent = '';
  const live = region;
  setTimeout(() => {
    live.textContent = text;
  }, 50);
}

/** @param {HTMLElement} list */
function itemsOf(list) {
  return /** @type {HTMLElement[]} */ ([...list.children]).filter(
    (child) => child.dataset.reorderId !== undefined,
  );
}

/** @param {HTMLElement} element */
function middleOf(element) {
  const { top, height } = element.getBoundingClientRect();
  return top + height / 2;
}

/**
 * Scrolls the list's scrolling container (or the page) when a drag nears its
 * top or bottom edge.
 *
 * @param {HTMLElement} list
 * @param {number} y
 */
function scrollNearEdge(list, y) {
  let scroller = list.parentElement;
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
    scroller = scroller.parentElement;
  }
  const area = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const step = y < area.top + EDGE ? -12 : y > area.bottom - EDGE ? 12 : 0;
  if (step === 0) return;
  if (scroller) scroller.scrollBy(0, step);
  else window.scrollBy(0, step);
}
