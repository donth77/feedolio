import { useId, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toastShown } from '../../app/toastSlice.js';
import Icon from '../../components/Icon.jsx';
import { MonogramTile } from '../../components/Monogram.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Segmented from '../../components/Segmented.jsx';
import { displayUrl, monogramFor, tintFor } from '../../lib/feeds.js';
import { useFocusAfterRemoval } from '../../lib/useFocusAfterRemoval.js';
import AccountPanel from '../auth/AccountPanel.jsx';
import { lookOf } from '../feeds/useFeeds.js';
import {
  densityChanged,
  layoutChanged,
  readingChanged,
  selectDensity,
  selectLayout,
  selectReading,
  selectTheme,
  themeChanged,
} from '../preferences/preferencesSlice.js';
import AddFeedForm from './AddFeedForm.jsx';
import { beginPointerDrag, moveByStep } from './feedReorder.js';
import styles from './Settings.module.css';
import SettingsTabs from './SettingsTabs.jsx';
import {
  defaultsRestored,
  feedMoved,
  selectAllSubscriptions,
  selectCanRestoreDefaults,
  selectSuggestedFeeds,
  subscriptionAdded,
  subscriptionRemoved,
  subscriptionRestored,
  subscriptionToggled,
} from './subscriptionsSlice.js';

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const LAYOUTS = [
  { value: 'list', label: 'List' },
  { value: 'cards', label: 'Cards' },
];
const DENSITIES = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];
const SIZES = [
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Medium' },
  { value: 'l', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
];
const FONTS = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans' },
];

/** Feeds, appearance and account, at /settings. Everything saves as it changes. */
export default function Settings() {
  const dispatch = useDispatch();
  const theme = useSelector(selectTheme);
  const layout = useSelector(selectLayout);
  const density = useSelector(selectDensity);
  const reading = useSelector(selectReading);

  return (
    <>
      <PageHeader title="Settings" description="Changes save automatically on this device." />
      <SettingsTabs />
      <div className={styles.sections}>
        <section aria-labelledby="settings-feeds" className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 id="settings-feeds" tabIndex={-1} className={styles.sectionTitle}>
              Feeds
            </h2>
            <p className={styles.help}>
              Choose what appears in All stories. Removing a feed keeps any stories you saved from
              it.
            </p>
          </div>
          <div className={styles.addBox}>
            <AddFeedForm
              onAdded={({ title }) => dispatch(toastShown({ message: `Added ${title}` }))}
            />
          </div>
          <YourFeeds />
          <SuggestedFeeds />
        </section>

        <section aria-labelledby="settings-appearance" className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 id="settings-appearance" tabIndex={-1} className={styles.sectionTitle}>
              Appearance
            </h2>
            <p className={styles.help}>
              Layout and density apply to story lists. Text size and font apply to the story page,
              where the Aa button changes them too.
            </p>
          </div>
          <Segmented
            legend="Theme"
            options={THEMES}
            value={theme}
            onChange={(value) => dispatch(themeChanged(value))}
          />
          <Segmented
            legend="Story list layout"
            options={LAYOUTS}
            value={layout}
            onChange={(value) => dispatch(layoutChanged(value))}
          />
          <Segmented
            legend="Density"
            options={DENSITIES}
            value={density}
            onChange={(value) => dispatch(densityChanged(value))}
          />
          <Segmented
            legend="Story text size"
            options={SIZES}
            value={reading.size}
            onChange={(size) => dispatch(readingChanged({ size }))}
          />
          <Segmented
            legend="Story font"
            options={FONTS}
            value={reading.font}
            onChange={(font) => dispatch(readingChanged({ font }))}
          />
        </section>

        <section aria-labelledby="settings-account" className={styles.section}>
          <h2 id="settings-account" tabIndex={-1} className={styles.sectionTitle}>
            Account
          </h2>
          <AccountPanel variant="settings" />
        </section>
      </div>
    </>
  );
}

/**
 * Every followed feed, in the reader's order, with a switch to show it in All
 * stories and Remove. Feeds are reordered by dragging their grip (any pointer,
 * touch included) or with Move up and Move down.
 */
function YourFeeds() {
  const dispatch = useDispatch();
  const subscriptions = useSelector(selectAllSubscriptions);
  const list = useRef(/** @type {HTMLUListElement|null} */ (null));
  const heading = useRef(/** @type {HTMLHeadingElement|null} */ (null));
  const removing = useFocusAfterRemoval(list, 'button[data-remove]', heading, subscriptions);
  /** @type {import('./feedReorder.js').Move} */
  const move = (id, to) => dispatch(feedMoved({ id, to }));

  /**
   * Move up or Move down: one place, keeping focus on the button pressed.
   *
   * @param {import('react').MouseEvent<HTMLButtonElement>} event
   * @param {-1|1} by
   */
  const step = (event, by) => {
    const item = /** @type {HTMLElement|null} */ (event.currentTarget.closest('[data-reorder-id]'));
    if (!list.current || !item) return;
    moveByStep({
      list: list.current,
      item,
      by,
      move,
      label: item.dataset.reorderLabel ?? 'Feed',
      focus: by < 0 ? '[data-move="up"]' : '[data-move="down"]',
    });
  };

  /** @param {import('react').PointerEvent<HTMLUListElement>} event */
  const pressGrip = (event) => {
    const grip = /** @type {Element} */ (event.target).closest('[data-reorder-grip]');
    const item = /** @type {HTMLElement|null|undefined} */ (grip?.closest('[data-reorder-id]'));
    if (!item || !list.current || event.button !== 0) return;
    event.preventDefault();
    beginPointerDrag({
      list: list.current,
      item,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      move,
      now: true,
    });
  };

  return (
    <div className={styles.group}>
      <h3 ref={heading} tabIndex={-1} className={styles.groupTitle}>
        Your feeds
      </h3>
      {subscriptions.length === 0 ? (
        <p className={styles.help}>You don’t follow any feeds. Add one above.</p>
      ) : (
        <ul ref={list} className={styles.rows} aria-label="Your feeds" onPointerDown={pressGrip}>
          {subscriptions.map((subscription, index) => (
            <FeedRow
              key={subscription.id}
              subscription={subscription}
              first={index === 0}
              last={index === subscriptions.length - 1}
              onMoveUp={(event) => step(event, -1)}
              onMoveDown={(event) => step(event, 1)}
              onToggle={() => dispatch(subscriptionToggled(subscription.id))}
              onRemove={() => {
                removing(index);
                dispatch(subscriptionRemoved(subscription.id));
                dispatch(
                  toastShown({
                    message: `Removed ${subscription.title}`,
                    // Undo puts it back where it was.
                    undo: subscriptionRestored(subscription, index),
                  }),
                );
              }}
            />
          ))}
        </ul>
      )}
      <p className={styles.help}>
        Hidden feeds stay in the sidebar, so you can still open them directly.
      </p>
    </div>
  );
}

/**
 * @param {{
 *   subscription: import('./subscriptionsSlice.js').Subscription,
 *   first: boolean,
 *   last: boolean,
 *   onMoveUp: (event: import('react').MouseEvent<HTMLButtonElement>) => void,
 *   onMoveDown: (event: import('react').MouseEvent<HTMLButtonElement>) => void,
 *   onToggle: () => void,
 *   onRemove: () => void,
 * }} props
 */
function FeedRow({ subscription, first, last, onMoveUp, onMoveDown, onToggle, onRemove }) {
  const id = useId();
  const { title } = subscription;
  return (
    <li className={styles.row} data-reorder-id={subscription.id} data-reorder-label={title}>
      {/* Pointer only: keyboard and screen reader users have Move up and Move down. */}
      <span className={styles.grip} data-reorder-grip="" aria-hidden="true" title="Drag to reorder">
        <GripIcon />
      </span>
      <MonogramTile feed={lookOf(subscription)} className={styles.tile} />
      <div className={styles.rowText}>
        <span className={styles.rowTitle}>
          <span id={`${id}-title`}>{subscription.title}</span>
          {subscription.isDefault && <span className={styles.tag}>Starter</span>}
        </span>
        <span className={styles.rowUrl}>{displayUrl(subscription.url)}</span>
      </div>
      <label className={styles.switchLabel}>
        <input
          type="checkbox"
          role="switch"
          className={styles.switch}
          checked={subscription.enabled}
          aria-labelledby={`${id}-show ${id}-title`}
          onChange={onToggle}
        />
        <span id={`${id}-show`}>Show in All stories</span>
      </label>
      <div className={styles.rowActions}>
        {/* aria-disabled, not disabled, so focus stays when a feed reaches an end. */}
        <button
          type="button"
          className={styles.iconButton}
          aria-label={`Move ${title} up`}
          aria-disabled={first || undefined}
          data-move="up"
          onClick={onMoveUp}
        >
          <Icon name="chevronDown" size={18} className={styles.up} />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={`Move ${title} down`}
          aria-disabled={last || undefined}
          data-move="down"
          onClick={onMoveDown}
        >
          <Icon name="chevronDown" size={18} />
        </button>
        <button
          type="button"
          className={styles.quiet}
          aria-label={`Remove ${title}`}
          data-remove=""
          onClick={onRemove}
        >
          <Icon name="close" size={18} />
          Remove
        </button>
      </div>
    </li>
  );
}

/** Six dots: the handle that drags a feed. Drawn here, as only Settings uses it. */
function GripIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" focusable="false">
      {[6, 12, 18].flatMap((cy) =>
        [9, 15].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.6" />),
      )}
    </svg>
  );
}

/** Starter feeds the reader removed, to add back. */
function SuggestedFeeds() {
  const dispatch = useDispatch();
  const suggested = useSelector(selectSuggestedFeeds);
  const canRestore = useSelector(selectCanRestoreDefaults);
  const list = useRef(/** @type {HTMLUListElement|null} */ (null));
  const heading = useRef(/** @type {HTMLHeadingElement|null} */ (null));
  const adding = useFocusAfterRemoval(list, 'button[data-add]', heading, suggested);

  return (
    <div className={styles.group}>
      <div className={styles.groupHead}>
        <div className={styles.sectionHead}>
          <h3 ref={heading} tabIndex={-1} className={styles.groupTitle}>
            Suggested feeds
          </h3>
          <p className={styles.help}>
            Starter feeds you removed. Add them back one at a time, or restore all five.
          </p>
        </div>
        <button
          type="button"
          className={styles.secondary}
          disabled={!canRestore}
          onClick={() => {
            dispatch(defaultsRestored());
            dispatch(toastShown({ message: 'Starter feeds restored' }));
          }}
        >
          Restore starter feeds
        </button>
      </div>
      {suggested.length === 0 ? (
        <p className={styles.help}>You follow every starter feed.</p>
      ) : (
        <ul ref={list} className={styles.rows} aria-label="Suggested feeds">
          {suggested.map((feed, index) => (
            <li key={feed.url} className={styles.row}>
              <MonogramTile
                feed={{ monogram: monogramFor(feed.title), tint: tintFor(feed.url) }}
                className={styles.tile}
              />
              <div className={styles.rowText}>
                <span className={styles.rowTitle}>
                  {feed.title}
                  <span className={styles.tag}>Starter</span>
                </span>
                <span className={styles.rowUrl}>{displayUrl(feed.url)}</span>
              </div>
              <button
                type="button"
                className={styles.secondary}
                aria-label={`Add ${feed.title}`}
                data-add=""
                onClick={() => {
                  adding(index);
                  dispatch(subscriptionAdded(feed));
                  dispatch(toastShown({ message: `Added ${feed.title}` }));
                }}
              >
                <Icon name="add" size={18} />
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
