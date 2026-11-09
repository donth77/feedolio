import { useEffect, useId, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Icon from '../../components/Icon.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { updatedLabel } from '../../lib/time.js';
import { useNow } from '../../lib/useNow.js';
import {
  densityChanged,
  layoutChanged,
  selectDensity,
  selectLayout,
} from '../preferences/preferencesSlice.js';
import { useShowShortcuts } from '../shortcuts/shortcutsContext.js';
import styles from './ListHeader.module.css';
import { DIVIDER_ID, useRetryFeed } from './useFeeds.js';

const DENSITIES = [
  { value: 'comfortable', label: 'Comfortable', detail: 'Excerpts and larger images' },
  { value: 'compact', label: 'Compact', detail: 'Headlines only, smaller images' },
];

/**
 * A story list's title, with what's in it, how much is new and how fresh it
 * is; then Refresh, the List or Cards layout, density, and the shortcuts.
 *
 * @param {{
 *   title: string,
 *   summary: string,
 *   states: import('./useFeeds.js').FeedState[],
 *   newCount?: number,
 *   showJump?: boolean,
 * }} props
 *   newCount: stories since the last visit; showJump: the divider is on the page
 */
export default function ListHeader({ title, summary, states, newCount = 0, showJump = false }) {
  const now = useNow();
  const retry = useRetryFeed();
  const showShortcuts = useShowShortcuts();
  const loaded = states.some((state) => state.data);
  const refreshing = states.some((state) => state.isFetching);
  // The stalest feed says how up to date the list is.
  const fetchedAt = states
    .map((state) => state.data?.fetchedAt)
    .filter((time) => typeof time === 'string')
    .sort()[0];

  const parts = [
    <span key="summary">{summary}</span>,
    newCount > 0 && <span key="new">{newCount} new since your last visit</span>,
    fetchedAt && !refreshing && <span key="updated">Updated {updatedLabel(fetchedAt, now)}</span>,
    showJump && (
      <a key="jump" href={`#${DIVIDER_ID}`} className={styles.jump} onClick={jumpToDivider}>
        Jump to where you left off
      </a>
    ),
  ].filter(Boolean);

  return (
    <PageHeader
      title={title}
      description={parts.flatMap((part, index) =>
        index === 0
          ? [part]
          : [
              <span key={`dot-${index}`} aria-hidden="true">
                {' · '}
              </span>,
              part,
            ],
      )}
      actions={
        <>
          {states.length > 0 && (
            <button
              type="button"
              className={styles.button}
              disabled={refreshing}
              aria-keyshortcuts="R"
              data-shortcut="refresh"
              onClick={() => states.forEach((state) => retry(state.feed.url))}
            >
              <Icon name="refresh" size={18} />
              {refreshing && loaded ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
          <LayoutToggle />
          <DensityMenu />
          <button
            type="button"
            className={`${styles.button} ${styles.wideOnly}`}
            aria-haspopup="dialog"
            aria-keyshortcuts="?"
            onClick={showShortcuts}
          >
            <kbd className={styles.kbd} aria-hidden="true">
              ?
            </kbd>
            Shortcuts
          </button>
        </>
      }
    />
  );
}

/** List or Cards, as a pair of toggle buttons. */
function LayoutToggle() {
  const dispatch = useDispatch();
  const layout = useSelector(selectLayout);
  return (
    <div className={`${styles.toggle} ${styles.wideOnly}`} role="group" aria-label="Layout">
      <button
        type="button"
        aria-pressed={layout === 'list'}
        onClick={() => dispatch(layoutChanged('list'))}
      >
        <Icon name="layoutList" size={18} />
        List
      </button>
      <button
        type="button"
        aria-pressed={layout === 'cards'}
        onClick={() => dispatch(layoutChanged('cards'))}
      >
        <Icon name="layoutCards" size={18} />
        Cards
      </button>
    </div>
  );
}

/**
 * Comfortable or Compact, as a menu button. Arrow keys move through the
 * choices; Esc closes the menu and returns to the button.
 */
function DensityMenu() {
  const dispatch = useDispatch();
  const density = useSelector(selectDensity);
  const [open, setOpen] = useState(false);
  const wrapper = useRef(/** @type {HTMLDivElement|null} */ (null));
  const button = useRef(/** @type {HTMLButtonElement|null} */ (null));
  const menuId = useId();
  const current = DENSITIES.find((option) => option.value === density) ?? DENSITIES[0];

  useEffect(() => {
    if (!open) return undefined;
    const items = menuItems(wrapper.current);
    (items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
    const closeOnOutsideClick = (/** @type {PointerEvent} */ event) => {
      if (!wrapper.current?.contains(/** @type {Node} */ (event.target))) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  /** @param {import('react').KeyboardEvent<HTMLDivElement>} event */
  const onMenuKeyDown = (event) => {
    const items = menuItems(wrapper.current);
    const index = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    const moveTo = (/** @type {number} */ next) => {
      event.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };
    if (event.key === 'ArrowDown') moveTo(index + 1);
    else if (event.key === 'ArrowUp') moveTo(index - 1);
    else if (event.key === 'Home') moveTo(0);
    else if (event.key === 'End') moveTo(items.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') setOpen(false);
  };

  return (
    <div className={`${styles.menuWrap} ${styles.wideOnly}`} ref={wrapper}>
      <button
        ref={button}
        type="button"
        className={styles.button}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon name="density" size={18} />
        <span className="visually-hidden">Density:</span> {current.label}
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Density"
          className={styles.menu}
          onKeyDown={onMenuKeyDown}
        >
          {DENSITIES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={density === option.value}
              aria-describedby={`${menuId}-${option.value}`}
              tabIndex={-1}
              className={styles.menuItem}
              onClick={() => {
                dispatch(densityChanged(/** @type {'comfortable'|'compact'} */ (option.value)));
                close();
              }}
            >
              <span className={styles.menuCheck} aria-hidden="true">
                {density === option.value && <Icon name="check" size={18} />}
              </span>
              <span>{option.label}</span>
              <span
                id={`${menuId}-${option.value}`}
                className={styles.menuDetail}
                aria-hidden="true"
              >
                {option.detail}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** @param {HTMLElement|null} root */
function menuItems(root) {
  return /** @type {HTMLElement[]} */ ([
    ...(root?.querySelectorAll('[role="menuitemradio"]') ?? []),
  ]);
}

/**
 * Scrolls to the divider and puts focus on the first story the reader saw
 * last time.
 *
 * @param {import('react').MouseEvent<HTMLAnchorElement>} event
 */
function jumpToDivider(event) {
  const divider = document.getElementById(DIVIDER_ID);
  if (!divider) return;
  event.preventDefault();
  divider.scrollIntoView?.({ block: 'center' });
  divider.nextElementSibling?.querySelector('a')?.focus({ preventScroll: true });
}
