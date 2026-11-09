import { useSelector } from 'react-redux';
import { selectAiSettings } from '../aiSettingsSlice.js';
import { selectHiddenIds, selectMaybeJudgments, selectTagged } from './ruleEffects.js';
import { selectAllRules } from './rulesSlice.js';

/** @typedef {import('../../feeds/useFeeds.js').ListedStory} ListedStory */

/**
 * A list without the stories the reader's rules hid, and how many that was.
 *
 * @param {ListedStory[]} stories
 */
export function useWithoutHidden(stories) {
  const hiddenIds = useSelector(selectHiddenIds);
  if (hiddenIds.size === 0) return { stories, hidden: 0 };
  const visible = stories.filter(({ story }) => !hiddenIds.has(story.id));
  return { stories: visible, hidden: stories.length - visible.length };
}

/**
 * What the navigation shows for AI: Catch me up once a general model is set
 * up, Maybe and Hidden (with counts) once the reader has rules or hidden
 * stories, and tags. Nothing shows for readers who never set up AI.
 */
export function useAiNav() {
  const ai = useSelector(selectAiSettings);
  const rules = useSelector(selectAllRules);
  const hidden = useSelector(selectHiddenIds).size;
  const maybe = useSelector(selectMaybeJudgments).length;
  const tagged = useSelector(selectTagged);
  const catchUp = Boolean(ai.general && ai.features.catchUp);
  const ruleViews = rules.length > 0 || hidden > 0;
  return {
    show: catchUp || ruleViews,
    catchUp,
    ruleViews,
    maybe,
    hidden,
    tags: [...tagged].map(([tag, judgments]) => ({ tag, count: judgments.length })),
  };
}

/**
 * The address of a tag's page.
 *
 * @param {string} tag
 */
export const tagPath = (tag) => `/tags/${encodeURIComponent(tag)}`;
