import { useDispatch, useSelector } from 'react-redux';
import { toastShown } from '../../app/toastSlice.js';
import Icon from '../../components/Icon.jsx';
import {
  bookmarkRemoved,
  bookmarkRestored,
  bookmarkToggled,
  selectBookmarkById,
} from './bookmarksSlice.js';
import styles from './BookmarkButton.module.css';

/**
 * Saves a story, or un-saves it with an Undo toast. A toggle: its name stays
 * the same and aria-pressed says whether the story is saved; the filled icon
 * and "Saved" label say it on screen.
 *
 * - row: in a headline list; icon only until saved. Named after the story.
 * - page: on the story page; always labelled.
 *
 * @param {{
 *   story: import('../../lib/types.js').Story,
 *   feedTitle: string,
 *   variant?: 'row'|'page',
 *   className?: string,
 * }} props
 */
export default function BookmarkButton({ story, feedTitle, variant = 'row', className = '' }) {
  const bookmark = useSelector((state) => selectBookmarkById(state, story.id));
  const dispatch = useDispatch();
  const saved = Boolean(bookmark);

  const toggle = () => {
    if (bookmark) {
      dispatch(bookmarkRemoved(bookmark.id));
      dispatch(toastShown({ message: 'Removed from Saved', undo: bookmarkRestored(bookmark) }));
    } else {
      dispatch(bookmarkToggled(story, feedTitle));
    }
  };

  return (
    <button
      type="button"
      className={`${styles.save} ${styles[variant]} ${className}`}
      aria-pressed={saved}
      aria-label={variant === 'page' ? 'Save story' : `Save ${story.title}`}
      onClick={toggle}
    >
      <Icon name={saved ? 'savedFilled' : 'saved'} size={variant === 'page' ? 18 : 20} />
      {(variant === 'page' || saved) && (
        <span className={styles.label} aria-hidden="true">
          {saved ? 'Saved' : 'Save'}
        </span>
      )}
    </button>
  );
}

/**
 * Removes a story from Saved: the button on each Saved row.
 *
 * @param {{
 *   bookmark: import('./bookmarksSlice.js').Bookmark,
 *   onRemove?: () => void,
 *   className?: string,
 * }} props
 */
export function RemoveBookmarkButton({ bookmark, onRemove, className = '' }) {
  const dispatch = useDispatch();
  return (
    <button
      type="button"
      className={`${styles.save} ${styles.row} ${className}`}
      aria-label={`Remove from saved: ${bookmark.story.title}`}
      data-saved=""
      onClick={() => {
        onRemove?.();
        dispatch(bookmarkRemoved(bookmark.id));
        dispatch(toastShown({ message: 'Removed from Saved', undo: bookmarkRestored(bookmark) }));
      }}
    >
      <Icon name="savedFilled" size={20} />
    </button>
  );
}
