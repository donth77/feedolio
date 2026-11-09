import { useId, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toastShown } from '../../app/toastSlice.js';
import Icon from '../../components/Icon.jsx';
import { MonogramTile } from '../../components/Monogram.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Segmented from '../../components/Segmented.jsx';
import { displayUrl, monogramFor, tintFor } from '../../lib/feeds.js';
import { useFocusAfterRemoval } from '../../lib/useFocusAfterRemoval.js';
import { lookOf } from '../feeds/useFeeds.js';
import {
  readingChanged,
  selectReading,
  selectTheme,
  themeChanged,
} from '../preferences/preferencesSlice.js';
import AddFeedForm from './AddFeedForm.jsx';
import styles from './Settings.module.css';
import {
  defaultsRestored,
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

/** Feeds and appearance, at /settings. Everything saves as it changes. */
export default function Settings() {
  const dispatch = useDispatch();
  const theme = useSelector(selectTheme);
  const reading = useSelector(selectReading);

  return (
    <>
      <PageHeader title="Settings" description="Changes save automatically on this device." />
      <div className={styles.sections}>
        <section aria-labelledby="settings-feeds" className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 id="settings-feeds" className={styles.sectionTitle}>
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
            <h2 id="settings-appearance" className={styles.sectionTitle}>
              Appearance
            </h2>
            <p className={styles.help}>
              Text size and font apply to the story page, where the Aa button changes them too.
            </p>
          </div>
          <Segmented
            legend="Theme"
            options={THEMES}
            value={theme}
            onChange={(value) => dispatch(themeChanged(value))}
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
      </div>
    </>
  );
}

/** Every followed feed, with a switch to show it in All stories and Remove. */
function YourFeeds() {
  const dispatch = useDispatch();
  const subscriptions = useSelector(selectAllSubscriptions);
  const list = useRef(/** @type {HTMLUListElement|null} */ (null));
  const heading = useRef(/** @type {HTMLHeadingElement|null} */ (null));
  const removing = useFocusAfterRemoval(list, 'button[data-remove]', heading, subscriptions);

  return (
    <div className={styles.group}>
      <h3 ref={heading} tabIndex={-1} className={styles.groupTitle}>
        Your feeds
      </h3>
      {subscriptions.length === 0 ? (
        <p className={styles.help}>You don’t follow any feeds. Add one above.</p>
      ) : (
        <ul ref={list} className={styles.rows} aria-label="Your feeds">
          {subscriptions.map((subscription, index) => (
            <FeedRow
              key={subscription.id}
              subscription={subscription}
              onToggle={() => dispatch(subscriptionToggled(subscription.id))}
              onRemove={() => {
                removing(index);
                dispatch(subscriptionRemoved(subscription.id));
                dispatch(
                  toastShown({
                    message: `Removed ${subscription.title}`,
                    undo: subscriptionRestored(subscription),
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
 *   onToggle: () => void,
 *   onRemove: () => void,
 * }} props
 */
function FeedRow({ subscription, onToggle, onRemove }) {
  const id = useId();
  return (
    <li className={styles.row}>
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
      <button
        type="button"
        className={styles.quiet}
        aria-label={`Remove ${subscription.title}`}
        data-remove=""
        onClick={onRemove}
      >
        <Icon name="close" size={18} />
        Remove
      </button>
    </li>
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
