import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

/** G, then one of these, goes to a section. */
const GO_TO = /** @type {Record<string, string>} */ ({ t: '/today', a: '/', s: '/bookmarks' });
/** How long after G the second key counts. */
const SEQUENCE_MS = 1500;
/** Text fields take every key; buttons, radios and switches don't need letters. */
const TEXT_INPUTS = new Set(['text', 'search', 'url', 'email', 'password', 'number', 'tel']);

/**
 * The keyboard shortcuts. Keys act on the story whose headline has focus: J
 * and K move that focus down and up a list, so "selected" is simply "focused",
 * and everything also works with Tab. On a story page, J and K step to the
 * older and newer story.
 *
 * | Key           | Does                                   |
 * | ------------- | -------------------------------------- |
 * | J / K         | Next / previous story                  |
 * | Enter or O    | Open the selected story                |
 * | V             | Open the original on the publisher's site |
 * | S             | Save or unsave                         |
 * | R             | Refresh feeds                          |
 * | [             | Collapse or expand the sidebar         |
 * | /             | Search (within the feed on a feed's page) |
 * | G then T/A/S  | Go to Today, All stories or Saved      |
 * | ?             | Show the shortcuts                     |
 *
 * Shortcuts are off while the reader types in a field, with a modifier key
 * held, or while a dialog is open (dialogs handle their own keys, such as Esc).
 *
 * @param {{ onShowHelp: () => void }} options
 */
export function useShortcuts({ onShowHelp }) {
  const navigate = useNavigate();
  const goPressedAt = useRef(/** @type {number|null} */ (null));

  useEffect(() => {
    const onKeyDown = (/** @type {KeyboardEvent} */ event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (
        isTyping(event.target) ||
        document.querySelector('dialog[open], [role="dialog"], [role="menu"]')
      )
        return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      const goStartedAt = goPressedAt.current;
      goPressedAt.current = null;
      if (goStartedAt !== null && performance.now() - goStartedAt < SEQUENCE_MS) {
        if (GO_TO[key]) {
          event.preventDefault();
          navigate(GO_TO[key]);
        }
        return;
      }

      const handled = act(key, {
        showHelp: onShowHelp,
        startGo: () => {
          goPressedAt.current = performance.now();
        },
        search: () => {
          const field = document.getElementById('search-field');
          if (field) return field.focus();
          const feedId = /^\/feeds\/([^/]+)/.exec(window.location.pathname)?.[1];
          navigate(feedId ? `/search?in=${encodeURIComponent(feedId)}` : '/search');
        },
      });
      if (handled) event.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate, onShowHelp]);
}

/**
 * @param {string} key
 * @param {{ showHelp: () => void, startGo: () => void, search: () => void }} actions
 * @returns {boolean} Whether the key was a shortcut
 */
function act(key, { showHelp, startGo, search }) {
  const storyPage = document.querySelector('[data-story-page]');
  switch (key) {
    case 'j':
    case 'k':
      if (storyPage) clickIn(storyPage, key === 'j' ? 'older' : 'newer');
      else moveSelection(key === 'j' ? 1 : -1);
      return true;
    case 'o':
      selectedRow()?.querySelector('a[data-story-link]')?.click();
      return true;
    case 'v':
      if (storyPage) clickIn(storyPage, 'original');
      else openOriginal(selectedRow());
      return true;
    case 's':
      clickIn(storyPage ?? selectedRow(), 'save');
      return true;
    case 'r':
      clickIn(document, 'refresh');
      return true;
    case '[':
      // The sidebar exists from 1024 px; on smaller screens there's nothing to collapse.
      if (window.matchMedia?.('(min-width: 1024px)').matches) {
        clickIn(document.getElementById('sidebar'), 'sidebar');
      }
      return true;
    case 'g':
      startGo();
      return true;
    case '?':
      showHelp();
      return true;
    case '/':
      search();
      return true;
    default:
      return false;
  }
}

/** @param {EventTarget|null} target */
function isTyping(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type);
}

/** The story row or card whose headline has focus. */
function selectedRow() {
  return document.activeElement?.closest('[data-story-row]') ?? null;
}

/**
 * Moves focus to the next or previous story headline in the page's list.
 *
 * @param {1|-1} step
 */
function moveSelection(step) {
  const links = /** @type {HTMLAnchorElement[]} */ ([
    ...document.querySelectorAll('main [data-story-row] a[data-story-link]'),
  ]);
  if (links.length === 0) return;
  const current = links.indexOf(
    /** @type {HTMLAnchorElement} */ (selectedRow()?.querySelector('a[data-story-link]')),
  );
  const next =
    current === -1
      ? links[step === 1 ? 0 : links.length - 1]
      : links[Math.min(Math.max(current + step, 0), links.length - 1)];
  next.focus();
  next.closest('[data-story-row]')?.scrollIntoView?.({ block: 'nearest' });
}

/** @param {Element|null} row */
function openOriginal(row) {
  const url = row instanceof HTMLElement ? row.dataset.original : undefined;
  if (url && /^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Clicks the control a shortcut stands for, such as the Save button.
 *
 * @param {ParentNode|null} scope
 * @param {string} name  Its data-shortcut value
 */
function clickIn(scope, name) {
  const control = scope?.querySelector(`[data-shortcut="${name}"]`);
  if (control instanceof HTMLElement) control.click();
}
