/**
 * The story a reader last opened from a list, so focus can return to it when
 * they come back (with the back link or the browser's Back button).
 */
let opened = /** @type {string|null} */ (null);

/** @param {string} storyId */
export function rememberOpenedStory(storyId) {
  opened = storyId;
}

/** The remembered story, forgotten once asked for. */
export function takeOpenedStory() {
  const storyId = opened;
  opened = null;
  return storyId;
}
