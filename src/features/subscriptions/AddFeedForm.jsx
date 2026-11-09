import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router';
import Icon from '../../components/Icon.jsx';
import { MonogramTile } from '../../components/Monogram.jsx';
import { displayUrl, monogramFor, tintFor } from '../../lib/feeds.js';
import { shortDate, storyTime } from '../../lib/time.js';
import { useNow } from '../../lib/useNow.js';
import { sortNewestFirst } from '../feeds/useFeeds.js';
import { postingLabel } from './addFeed.js';
import styles from './AddFeedForm.module.css';
import { useAddFeed } from './useAddFeed.js';

/** Headlines shown in a preview. */
const PREVIEW_STORIES = 3;

/**
 * Paste any link, see what it leads to, then follow it. Used in the Add feed
 * dialog and in Settings.
 *
 * @param {{
 *   onAdded: (subscription: { id: string, title: string }) => void,
 *   onCancel?: () => void,
 *   onNavigate?: () => void,
 *   autoFocus?: boolean,
 * }} props
 *   onCancel: shows a Cancel button; onNavigate: called when a link leaves the form
 */
export default function AddFeedForm({ onAdded, onCancel, onNavigate, autoFocus = false }) {
  const id = useId();
  const field = useRef(/** @type {HTMLInputElement|null} */ (null));
  const flow = useAddFeed({ onAdded });
  const { status, problem, followed, preview } = flow;

  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  const announcement =
    status === 'checking'
      ? 'Looking for a feed…'
      : status === 'ready' && preview
        ? `Found ${preview.feed.title}.`
        : status === 'choosing' && flow.choices
          ? `Found ${flow.choices.length} feeds on this page. Choose one.`
          : status === 'followed' && followed
            ? `You already follow ${followed.title}.`
            : '';

  return (
    <div className={styles.flow}>
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          flow.find();
        }}
      >
        <label htmlFor={`${id}-url`} className={styles.label}>
          Website or feed link
        </label>
        <div className={styles.inputRow}>
          <input
            ref={field}
            id={`${id}-url`}
            className={styles.input}
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="theverge.com or https://example.com/feed"
            aria-invalid={status === 'problem'}
            aria-describedby={`${id}-help${problem ? ` ${id}-problem` : ''}`}
            value={flow.input}
            onChange={(event) => flow.setInput(event.target.value)}
          />
          <button type="submit" className={styles.secondary} disabled={status === 'checking'}>
            <Icon name="search" size={18} />
            {status === 'checking' ? 'Looking…' : 'Find feed'}
          </button>
        </div>
        <p id={`${id}-help`} className={styles.help}>
          Paste any website or feed address. Feedolio finds the feed for you.
        </p>
      </form>

      <p role="status" className="visually-hidden">
        {announcement}
      </p>

      {problem && (
        <div id={`${id}-problem`} className={styles.problem} role="alert">
          <Icon name="alert" className={styles.problemIcon} />
          <div className={styles.problemText}>
            <p className={styles.problemTitle}>{problem.title}</p>
            {problem.detail && <p>{problem.detail}</p>}
          </div>
        </div>
      )}

      {status === 'followed' && followed && (
        <div className={styles.note}>
          <Icon name="info" className={styles.noteIcon} />
          <p>
            You already follow <strong>{followed.title}</strong>.{' '}
            <Link to={`/feeds/${followed.id}`} onClick={onNavigate}>
              Open {followed.title}
            </Link>
          </p>
        </div>
      )}

      {flow.choices && status !== 'followed' && (
        <fieldset className={styles.choices}>
          <legend className={styles.choicesLegend}>
            We found {flow.choices.length} feeds on this page. Choose one.
          </legend>
          {flow.choices.map((choice) => (
            <label key={choice.url} className={styles.choice}>
              <input
                type="radio"
                name={`${id}-choice`}
                value={choice.url}
                checked={flow.chosenUrl === choice.url}
                onChange={() => flow.choose(choice.url)}
              />
              <span className={styles.choiceText}>
                <span className={styles.choiceTitle}>{choice.title || displayUrl(choice.url)}</span>
                <span className={styles.choiceUrl}>{displayUrl(choice.url)}</span>
              </span>
            </label>
          ))}
          {flow.previewing && <p className={styles.help}>Loading a preview…</p>}
        </fieldset>
      )}

      {preview && <Preview data={preview} />}

      {(onCancel || preview) && (
        <div className={styles.actions}>
          {onCancel && (
            <button
              type="button"
              className={styles.quiet}
              onClick={() => {
                flow.reset();
                onCancel();
              }}
            >
              Cancel
            </button>
          )}
          {preview && (
            <button type="button" className={styles.primary} onClick={flow.add}>
              <Icon name="add" size={18} />
              Add feed
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * What following this feed would bring: its name, site, how often it posts,
 * and its latest headlines.
 *
 * @param {{ data: import('../../lib/types.js').FeedResponse }} props
 */
function Preview({ data }) {
  const now = useNow();
  const { feed } = data;
  const latest = sortNewestFirst(data.stories).slice(0, PREVIEW_STORIES);
  const posting = postingLabel(feed.postsPerWeek, latest[0]?.publishedAt ?? null, now, shortDate);
  const site = displayUrl(feed.siteUrl ?? feed.url).split('/')[0];
  const mark = { monogram: monogramFor(feed.title), tint: tintFor(feed.url) };

  return (
    <section className={styles.preview} aria-label={`Preview of ${feed.title}`}>
      <p className={styles.found}>
        <Icon name="check" size={18} />
        Found {feed.title}
      </p>
      <div className={styles.identity}>
        <MonogramTile feed={mark} className={styles.tile} />
        <div className={styles.identityText}>
          <span className={styles.feedTitle}>{feed.title}</span>
          <span className={styles.feedMeta}>{[site, posting].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      {latest.length > 0 && (
        <div className={styles.latest}>
          <h3 className={styles.overline}>Latest stories</h3>
          <ul className={styles.latestList}>
            {latest.map((story) => (
              <li key={story.id} className={styles.latestItem}>
                <span className={styles.latestTitle}>{story.title}</span>
                {story.publishedAt && (
                  <time className={styles.latestTime} dateTime={story.publishedAt}>
                    {storyTime(story.publishedAt, now)}
                  </time>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
