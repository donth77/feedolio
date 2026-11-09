import { Link } from 'react-router';
import BookmarkButton from '../features/bookmarks/BookmarkButton.jsx';
import { sizedImageUrl } from '../lib/images.js';
import { rememberOpenedStory } from '../lib/returnFocus.js';
import { fullTime, storyTime } from '../lib/time.js';
import RuleBadges from './RuleBadges.jsx';
import styles from './StoryCard.module.css';
import StoryImage from './StoryImage.jsx';

/** Cards are at most about 400 CSS pixels wide; this covers 2× screens. */
const CARD_IMAGE_WIDTH = 800;

/**
 * One story as an image-first card, for the Cards layout: image or monogram
 * tile, source and time, headline, excerpt and a Save button.
 *
 * @param {{
 *   item: import('../features/feeds/useFeeds.js').ListedStory,
 *   now: number,
 *   from?: { pathname: string, label: string },
 *   effects?: import('../features/ai/rules/ruleEffects.js').StoryEffects,
 * }} props
 */
export default function StoryCard({ item, now, from, effects }) {
  const { story, feed } = item;
  return (
    <li
      className={styles.card}
      data-story-row=""
      data-story-id={story.id}
      data-original={story.link}
      data-highlight={effects?.highlight ? '' : undefined}
    >
      <div className={styles.media}>
        <StoryImage
          src={story.imageUrl && sizedImageUrl(story.imageUrl, CARD_IMAGE_WIDTH)}
          feed={feed}
          className={styles.fill}
        />
      </div>
      <div className={styles.body}>
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
        </p>
        <h3 className={styles.title}>
          <Link
            className={styles.link}
            to={`/feeds/${story.feedId}/stories/${story.id}`}
            state={from && { from }}
            data-story-link=""
            onClick={() => rememberOpenedStory(story.id)}
          >
            {story.title}
          </Link>
        </h3>
        {story.excerpt && <p className={styles.excerpt}>{story.excerpt}</p>}
        <RuleBadges effects={effects} />
      </div>
      <div className={styles.foot}>
        <BookmarkButton story={story} feedTitle={feed.title} variant="card" />
      </div>
    </li>
  );
}
