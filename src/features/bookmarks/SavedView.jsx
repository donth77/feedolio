import { useRef } from 'react';
import { useSelector } from 'react-redux';
import PageHeader from '../../components/PageHeader.jsx';
import { EmptyState } from '../../components/StoryList.jsx';
import listStyles from '../../components/StoryList.module.css';
import StoryRow from '../../components/StoryRow.jsx';
import { monogramFor, tintForId } from '../../lib/feeds.js';
import { useFocusAfterRemoval } from '../../lib/useFocusAfterRemoval.js';
import { selectDensity } from '../preferences/preferencesSlice.js';
import { useNow } from '../../lib/useNow.js';
import { lookOf } from '../feeds/useFeeds.js';
import { selectSubscriptionEntities } from '../subscriptions/subscriptionsSlice.js';
import { RemoveBookmarkButton } from './BookmarkButton.jsx';
import { selectAllBookmarks } from './bookmarksSlice.js';

/** Where the story page's back link returns to. */
const FROM = { pathname: '/bookmarks', label: 'Saved' };

/**
 * Saved stories, most recently saved first, at /bookmarks. They come from the
 * bookmarks' own copies, so they show even when their feed is gone.
 */
export default function SavedView() {
  const bookmarks = useSelector(selectAllBookmarks);
  const subscriptions = useSelector(selectSubscriptionEntities);
  const density = useSelector(selectDensity);
  const now = useNow();
  const list = useRef(/** @type {HTMLUListElement|null} */ (null));
  const browse = useRef(/** @type {HTMLAnchorElement|null} */ (null));
  const removing = useFocusAfterRemoval(list, 'button[data-saved]', browse, bookmarks);

  const count = bookmarks.length;
  return (
    <>
      <PageHeader
        title="Saved"
        description={
          count > 0
            ? `${count} ${count === 1 ? 'story' : 'stories'} saved on this device · most recently saved first`
            : 'Stories you save are kept on this device.'
        }
      />
      {count === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          icon="saved"
          action={{ to: '/', label: 'Browse all stories' }}
          actionRef={browse}
        >
          Use the bookmark on any story to keep it here. Saved stories still open after they drop
          out of their feed.
        </EmptyState>
      ) : (
        <ul
          ref={list}
          className={listStyles.list}
          aria-label="Saved stories"
          data-density={density}
        >
          {bookmarks.map((bookmark, index) => {
            const subscription = subscriptions[bookmark.feedId];
            const feed = subscription
              ? lookOf(subscription)
              : {
                  title: bookmark.feedTitle,
                  monogram: monogramFor(bookmark.feedTitle),
                  tint: tintForId(bookmark.feedId),
                };
            return (
              <StoryRow
                key={bookmark.id}
                item={{ story: bookmark.story, feed }}
                now={now}
                from={FROM}
                headingLevel={2}
                savedAt={bookmark.savedAt}
                action={
                  <RemoveBookmarkButton bookmark={bookmark} onRemove={() => removing(index)} />
                }
              />
            );
          })}
        </ul>
      )}
    </>
  );
}
