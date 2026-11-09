import { Link } from 'react-router';
import { sizedImageUrl } from '../lib/images.js';
import { fullTime, storyTime } from '../lib/time.js';
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
 * headline and excerpt. The headline links to the story page.
 *
 * @param {{ item: import('../features/feeds/useFeeds.js').ListedStory, now: number }} props
 */
export default function StoryRow({ item, now }) {
  const { story, feed } = item;
  const author = shortAuthors(story.author);

  return (
    <li className={styles.row}>
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
          {story.publishedAt && (
            <>
              <span aria-hidden="true"> · </span>
              <time dateTime={story.publishedAt} title={fullTime(story.publishedAt)}>
                {storyTime(story.publishedAt, now)}
              </time>
            </>
          )}
          {author && (
            <span className={styles.author}>
              <span aria-hidden="true"> · </span>
              {author}
            </span>
          )}
        </p>
        <h3 className={styles.headline}>
          <Link className={styles.link} to={`/feeds/${story.feedId}/stories/${story.id}`}>
            {story.title}
          </Link>
        </h3>
        {story.excerpt && <p className={styles.excerpt}>{story.excerpt}</p>}
      </div>
    </li>
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
