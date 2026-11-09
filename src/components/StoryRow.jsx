import { Link } from 'react-router';
import BookmarkButton from '../features/bookmarks/BookmarkButton.jsx';
import { sizedImageUrl } from '../lib/images.js';
import { rememberOpenedStory } from '../lib/returnFocus.js';
import { fullTime, savedWhen, storyTime } from '../lib/time.js';
import RuleBadges from './RuleBadges.jsx';
import StoryImage from './StoryImage.jsx';
import styles from './StoryRow.module.css';

/** Thumbnails are at most 128 CSS pixels wide; this covers 2× screens. */
const THUMB_WIDTH = 256;

/**
 * "A and B", or "A and 3 others" for longer lists.
 *
 * @param {string|null} author
 */
function shortAuthors(author) {
  if (!author) return null;
  const names = author.split(/\s*,\s*/).filter(Boolean);
  if (names.length <= 1) return author;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

/**
 * One headline in a list: image or monogram tile, source, time, author,
 * headline, excerpt and a Save button. The headline links to the story page,
 * telling it which list to go back to.
 *
 * @param {{
 *   item: { story: import('../lib/types.js').Story, feed: import('./Monogram.jsx').FeedMark & { title: string } },
 *   now: number,
 *   from?: { pathname: string, label: string },
 *   headingLevel?: 2|3,
 *   savedAt?: string,
 *   action?: import('react').ReactNode | false,
 *   effects?: import('../features/ai/rules/ruleEffects.js').StoryEffects,
 *   note?: import('react').ReactNode,
 *   extra?: import('react').ReactNode,
 * }} props
 *   headingLevel: 3 under date headers, 2 in a plain list
 *   savedAt: shows when the story was saved instead of when it was published
 *   action: replaces the Save button; false leaves it out
 *   effects: what the reader's rules say about it
 *   note: a line under the excerpt, e.g. why a rule hid it
 *   extra: controls under the text, e.g. answers in Maybe
 */
export default function StoryRow({
  item,
  now,
  from,
  headingLevel = 3,
  savedAt,
  action,
  effects,
  note,
  extra,
}) {
  const { story, feed } = item;
  const author = shortAuthors(story.author);
  const Headline = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <li
      className={styles.row}
      data-story-row=""
      data-story-id={story.id}
      data-original={story.link}
      data-highlight={effects?.highlight ? '' : undefined}
    >
      <div className={styles.thumb}>
        <StoryImage
          src={story.imageUrl && sizedImageUrl(story.imageUrl, THUMB_WIDTH)}
          feed={feed}
          className={styles.fill}
        />
      </div>
      <div className={styles.text}>
        <p className={styles.meta}>
          <span className={styles.source}>{feed.title}</span>
          {savedAt ? (
            <>
              <span aria-hidden="true"> · </span>
              <time dateTime={savedAt} title={fullTime(savedAt)}>
                Saved {savedWhen(savedAt, now)}
              </time>
            </>
          ) : (
            story.publishedAt && (
              <>
                <span aria-hidden="true"> · </span>
                <time dateTime={story.publishedAt} title={fullTime(story.publishedAt)}>
                  {storyTime(story.publishedAt, now)}
                </time>
              </>
            )
          )}
          {author && (
            <span className={styles.author}>
              <span aria-hidden="true"> · </span>
              {author}
            </span>
          )}
        </p>
        <Headline className={styles.headline}>
          <Link
            className={styles.link}
            to={`/feeds/${story.feedId}/stories/${story.id}`}
            state={from && { from }}
            data-story-link=""
            onClick={() => rememberOpenedStory(story.id)}
          >
            {story.title}
          </Link>
        </Headline>
        {story.excerpt && <p className={styles.excerpt}>{story.excerpt}</p>}
        <RuleBadges effects={effects} />
        {note && <p className={styles.note}>{note}</p>}
        {extra && <div className={styles.extra}>{extra}</div>}
        <KeyHint />
      </div>
      {action !== false && (
        <div className={styles.action}>
          {action ?? <BookmarkButton story={story} feedTitle={feed.title} />}
        </div>
      )}
    </li>
  );
}

/**
 * What the keys do, under the story selected with the keyboard. Screen reader
 * users get the full list from the ? overlay instead.
 */
export function KeyHint() {
  return (
    <p className={styles.hint} aria-hidden="true">
      <kbd className={styles.kbd}>Enter</kbd> open <kbd className={styles.kbd}>V</kbd> original{' '}
      <kbd className={styles.kbd}>S</kbd> save <kbd className={styles.kbd}>J</kbd>
      <kbd className={styles.kbd}>K</kbd> move
    </p>
  );
}

/** A grey placeholder row while feeds load. */
export function SkeletonRow() {
  return (
    <li className={styles.row} aria-hidden="true">
      <div className={`${styles.thumb} ${styles.skeleton}`} />
      <div className={styles.text}>
        <span className={styles.skeleton} style={{ width: '38%', height: 12 }} />
        <span className={styles.skeleton} style={{ width: '92%', height: 18 }} />
        <span className={styles.skeleton} style={{ width: '70%', height: 18 }} />
        <span className={styles.skeleton} style={{ width: '84%', height: 12 }} />
      </div>
    </li>
  );
}
