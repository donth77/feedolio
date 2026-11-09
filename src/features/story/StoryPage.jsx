import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import Icon from '../../components/Icon.jsx';
import { FeedDot } from '../../components/Monogram.jsx';
import { monogramFor, tintFor, tintForId } from '../../lib/feeds.js';
import { sizedImageUrl } from '../../lib/images.js';
import { fullTime, storyDate } from '../../lib/time.js';
import { useNow } from '../../lib/useNow.js';
import BookmarkButton from '../bookmarks/BookmarkButton.jsx';
import { feedErrorMessage } from '../feeds/feedApi.js';
import { selectReading } from '../preferences/preferencesSlice.js';
import { cleanStoryHtml, wordCount } from './cleanStoryHtml.js';
import ReadingSettings from './ReadingSettings.jsx';
import SafeHtml from './SafeHtml.jsx';
import styles from './StoryPage.module.css';
import { useStory } from './useStory.js';

/** @typedef {import('../../lib/types.js').Story} Story */
/** @typedef {import('./useStory.js').StoryLookup} StoryLookup */

/**
 * Where the back link goes, and whether that's the previous history entry.
 *
 * @typedef {{ pathname: string, label: string, inHistory: boolean }} BackTarget
 */

/** Reading speed for the "N min read" estimate. */
const WORDS_PER_MINUTE = 230;
/** Hero sizes to offer the browser; the largest covers the wide column (780 px) at 2×. */
const HERO_WIDTHS = [480, 800, 1024, 1536];
/** How wide the hero shows: the reading column, less the page's side padding on phones. */
const HERO_SIZES = '(max-width: 819px) calc(100vw - 40px), 780px';
/** Main images that came from outside the body; others already appear in it. */
const HERO_SOURCES = new Set(['media', 'enclosure']);
const MAX_TOPICS = 8;

/**
 * One story on its own page, at /feeds/:feedId/stories/:storyId: everything
 * its feed provides, with the reader's text size, font and line width.
 * Loaded on demand, with the sanitiser, so lists stay light.
 */
export default function StoryPage() {
  const { feedId = '', storyId = '' } = useParams();
  const location = useLocation();
  const lookup = useStory(feedId, storyId);
  const back = backTarget(location.state);
  const { status, story } = lookup;

  const title =
    status === 'ready' && story
      ? story.title
      : status === 'loading'
        ? 'Loading story'
        : status === 'error'
          ? 'Couldn’t load this story'
          : 'Story not available';
  useEffect(() => {
    document.title = `${title} · Feedolio`;
  }, [title]);

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <BackLink back={back} />
        {story && (
          <div className={styles.actions}>
            <ReadingSettings />
            <BookmarkButton story={story} feedTitle={lookup.feedTitle ?? ''} variant="page" />
          </div>
        )}
      </header>
      <main className={styles.main}>
        {status === 'ready' && story ? (
          <Article story={story} lookup={lookup} feedId={feedId} back={back} />
        ) : status === 'loading' ? (
          <StoryLoading />
        ) : status === 'error' ? (
          <StoryError lookup={lookup} />
        ) : (
          <StoryUnavailable lookup={lookup} feedId={feedId} />
        )}
      </main>
    </div>
  );
}

/**
 * Back to the list the reader came from. Going back through history restores
 * that list's scroll position; opened from elsewhere, it links to All stories.
 *
 * @param {{ back: BackTarget }} props
 */
function BackLink({ back }) {
  const navigate = useNavigate();
  return (
    <Link
      to={back.pathname}
      className={styles.back}
      onClick={(event) => {
        if (!back.inHistory || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(-1);
      }}
    >
      <Icon name="back" />
      <span className={styles.backLabel}>
        <span className="visually-hidden">Back to</span> {back.label}
      </span>
    </Link>
  );
}

/**
 * @param {{ story: Story, lookup: StoryLookup, feedId: string, back: BackTarget }} props
 */
function Article({ story, lookup, feedId, back }) {
  const reading = useSelector(selectReading);
  const now = useNow();
  const site = siteOf(story.link);
  const siteHref = site?.href ?? null;
  const heroUrl = story.imageSource && HERO_SOURCES.has(story.imageSource) ? story.imageUrl : null;
  const body = useMemo(
    () =>
      story.contentHtml ? cleanStoryHtml(story.contentHtml, { storyUrl: siteHref, heroUrl }) : null,
    [story.contentHtml, siteHref, heroUrl],
  );
  const minutes =
    story.hasFullContent && body
      ? Math.max(1, Math.round(wordCount(body) / WORDS_PER_MINUTE))
      : null;
  const feedTitle = lookup.feedTitle ?? '';
  const topics = uniqueTopics(story.categories);
  const feedMark = {
    monogram: monogramFor(feedTitle),
    tint: lookup.subscription ? tintFor(lookup.subscription.url) : tintForId(story.feedId),
  };

  // Moving to the next or previous story puts focus on its title, as a new page would.
  const heading = useRef(/** @type {HTMLHeadingElement|null} */ (null));
  const shownId = useRef(story.id);
  useEffect(() => {
    if (shownId.current === story.id) return;
    shownId.current = story.id;
    heading.current?.focus();
  }, [story.id]);

  return (
    <article
      className={styles.article}
      data-size={reading.size}
      data-font={reading.font}
      data-width={reading.width}
    >
      <div className={styles.head}>
        <div className={styles.sourceLine}>
          {lookup.subscription ? (
            <Link to={`/feeds/${feedId}`} className={styles.source}>
              <FeedDot feed={feedMark} />
              {feedTitle}
            </Link>
          ) : (
            <span className={styles.source}>
              <FeedDot feed={feedMark} />
              {feedTitle}
            </span>
          )}
          {topics.length > 0 && (
            <>
              <span aria-hidden="true" className={styles.dot}>
                ·
              </span>
              <ul className={styles.topics} aria-label="Topics">
                {topics.map((topic) => (
                  <li key={topic} className={styles.topic}>
                    {topic}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <h1 className={styles.title} ref={heading} tabIndex={-1}>
          {story.title}
        </h1>
        <Byline story={story} now={now} minutes={minutes} />
      </div>

      {heroUrl && <Hero url={heroUrl} />}

      {body ? (
        <SafeHtml fragment={body} className={styles.body} />
      ) : (
        story.excerpt && (
          <div className={styles.body}>
            <p>{story.excerpt}</p>
          </div>
        )
      )}

      {story.hasFullContent ? (
        site && (
          <div className={styles.end}>
            <OriginalLink site={site}>Read the original on {site.host}</OriginalLink>
          </div>
        )
      ) : (
        <div className={styles.summaryEnd}>
          <div className={styles.note} role="note">
            <Icon name="info" className={styles.noteIcon} />
            <div className={styles.noteText}>
              <p className={styles.noteTitle}>{feedTitle} only shares a summary in its feed</p>
              <p>
                That’s everything the feed provides.
                {site && ` The full story is on ${site.host}.`}
              </p>
            </div>
          </div>
          {site && <OriginalLink site={site}>Continue reading on {site.host}</OriginalLink>}
        </div>
      )}

      <Pager lookup={lookup} feedId={feedId} back={back} />
    </article>
  );
}

/**
 * Author, date and reading time.
 *
 * @param {{ story: Story, now: number, minutes: number|null }} props
 */
function Byline({ story, now, minutes }) {
  const parts = [
    story.author && (
      <span key="author" className={styles.author}>
        {story.author}
      </span>
    ),
    story.publishedAt && (
      <time key="date" dateTime={story.publishedAt} title={fullTime(story.publishedAt)}>
        {storyDate(story.publishedAt, now)}
      </time>
    ),
    minutes && <span key="time">{minutes} min read</span>,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className={styles.byline}>
      {parts.flatMap((part, index) =>
        index === 0
          ? [part]
          : [
              // The dot stays with what comes before it, so a line never starts with one.
              <span key={`dot-${index}`} aria-hidden="true">
                &nbsp;·{' '}
              </span>,
              part,
            ],
      )}
    </p>
  );
}

/**
 * The main image, when it didn't come from the body. Where the image host can
 * resize, phones get a smaller copy. Hidden if it fails to load: the page reads
 * fine without it.
 *
 * @param {{ url: string }} props
 */
function Hero({ url }) {
  const [failedUrl, setFailedUrl] = useState(/** @type {string|null} */ (null));
  if (failedUrl === url) return null;
  const copies = HERO_WIDTHS.map((width) => `${sizedImageUrl(url, width)} ${width}w`);
  const resizable = new Set(HERO_WIDTHS.map((width) => sizedImageUrl(url, width))).size > 1;
  return (
    <figure className={styles.hero}>
      <img
        className={styles.heroImage}
        src={sizedImageUrl(url, HERO_WIDTHS.at(-1) ?? 1536)}
        srcSet={resizable ? copies.join(', ') : undefined}
        sizes={resizable ? HERO_SIZES : undefined}
        alt=""
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(url)}
      />
    </figure>
  );
}

/**
 * The publisher's page, in a new tab.
 *
 * @param {{ site: { href: string }, children: import('react').ReactNode }} props
 */
function OriginalLink({ site, children }) {
  return (
    <a className={styles.primary} href={site.href} target="_blank" rel="noopener noreferrer">
      {children} <span className="visually-hidden">(opens in a new tab)</span>
      <Icon name="external" size={18} />
    </a>
  );
}

/**
 * Newer and older stories from the same feed. They replace this page in the
 * history, so Back still returns to the list.
 *
 * @param {{ lookup: StoryLookup, feedId: string, back: BackTarget }} props
 */
function Pager({ lookup, feedId, back }) {
  const { newer, older, feedTitle } = lookup;
  if (!newer && !older) return null;
  const state = back.inHistory ? { from: { pathname: back.pathname, label: back.label } } : null;
  const linkTo = (/** @type {Story} */ story) => `/feeds/${feedId}/stories/${story.id}`;
  return (
    <nav className={styles.pager} aria-label={`More from ${feedTitle}`}>
      {newer && (
        <Link to={linkTo(newer)} replace state={state} className={styles.pagerLink}>
          <span className={styles.pagerLabel}>Newer in {feedTitle}</span>{' '}
          <span className={styles.pagerTitle}>{newer.title}</span>
        </Link>
      )}
      {older && (
        <Link
          to={linkTo(older)}
          replace
          state={state}
          className={`${styles.pagerLink} ${styles.older}`}
        >
          <span className={styles.pagerLabel}>Older in {feedTitle}</span>{' '}
          <span className={styles.pagerTitle}>{older.title}</span>
        </Link>
      )}
    </nav>
  );
}

/** Grey shapes where the story will be. */
function StoryLoading() {
  return (
    <div className={styles.article} aria-busy="true">
      <p role="status" className="visually-hidden">
        Loading story…
      </p>
      <div className={styles.head} aria-hidden="true">
        <span className={styles.skeleton} style={{ width: '32%', height: 16 }} />
        <span className={styles.skeleton} style={{ width: '94%', height: 40 }} />
        <span className={styles.skeleton} style={{ width: '70%', height: 40 }} />
        <span className={styles.skeleton} style={{ width: '45%', height: 16 }} />
        <span className={styles.skeleton} style={{ width: '100%', height: 220 }} />
      </div>
    </div>
  );
}

/**
 * The feed didn't load, and there's no saved copy.
 *
 * @param {{ lookup: StoryLookup }} props
 */
function StoryError({ lookup }) {
  return (
    <div className={styles.state}>
      <h1 className={styles.stateTitle}>Couldn’t load this story</h1>
      <p className={styles.stateText}>
        {lookup.feedTitle} didn’t load. {feedErrorMessage(lookup.error)}
      </p>
      <div className={styles.stateActions}>
        <button type="button" className={styles.secondary} onClick={lookup.retry}>
          Retry
        </button>
        <Link to="/" className={styles.secondary}>
          All stories
        </Link>
      </div>
    </div>
  );
}

/**
 * The story isn't in its feed any more (feeds keep only their latest
 * stories), or its feed was removed, and it isn't saved.
 *
 * @param {{ lookup: StoryLookup, feedId: string }} props
 */
function StoryUnavailable({ lookup, feedId }) {
  const { subscription, feedTitle } = lookup;
  const site = lookup.siteUrl ? siteOf(lookup.siteUrl) : null;
  return (
    <div className={styles.state}>
      <h1 className={styles.stateTitle}>This story isn’t available</h1>
      <p className={styles.stateText}>
        {subscription
          ? `It’s no longer in ${feedTitle}’s feed. Feeds only keep their latest stories, so older ones drop out.`
          : 'It came from a feed you don’t follow, and it isn’t in your saved stories.'}
      </p>
      <div className={styles.stateActions}>
        {subscription && (
          <Link to={`/feeds/${feedId}`} className={styles.secondary}>
            Go to {feedTitle}
          </Link>
        )}
        {site && (
          <a
            className={styles.secondary}
            href={site.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            Visit {site.host} <span className="visually-hidden">(opens in a new tab)</span>
            <Icon name="external" size={18} />
          </a>
        )}
        <Link to="/" className={styles.secondary}>
          All stories
        </Link>
      </div>
    </div>
  );
}

/**
 * The list a reader came from, as lists pass it in the link's state;
 * otherwise All stories.
 *
 * @param {unknown} state  location.state
 * @returns {BackTarget}
 */
function backTarget(state) {
  const from = /** @type {{ from?: { pathname?: unknown, label?: unknown } } | null} */ (state)
    ?.from;
  if (
    typeof from?.pathname === 'string' &&
    /^\/(?!\/)/.test(from.pathname) &&
    typeof from.label === 'string' &&
    from.label
  ) {
    return { pathname: from.pathname, label: from.label, inHistory: true };
  }
  return { pathname: '/', label: 'All stories', inHistory: false };
}

/**
 * The publisher's page, if it's a web address.
 *
 * @param {string} link
 * @returns {{ href: string, host: string } | null}
 */
function siteOf(link) {
  try {
    const url = new URL(link);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return { href: url.href, host: url.hostname.replace(/^www\./, '') };
  } catch {
    return null;
  }
}

/** Categories without repeats (ignoring case), at most MAX_TOPICS. @param {string[]} categories */
function uniqueTopics(categories = []) {
  const seen = new Set();
  return categories
    .filter((topic) => {
      const key = topic.toLowerCase();
      if (!topic || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_TOPICS);
}
