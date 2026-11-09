import { answerKey } from '../cache.js';
import { MAX_GROUPS } from '../prompts.js';
import { groupStories, rankGroups, summarizeGroup } from '../router.js';

/**
 * Builds the "Catch me up" digest (§7.2): the general model groups the unread
 * stories into main stories, citing story ids; the decision model (or the
 * general model) ranks them; the general model summarises each. Links come
 * only from Feedolio's own story data: ids the model made up are dropped
 * (T-28), and nothing it writes becomes a link.
 *
 * @typedef {import('../prompts.js').PromptStory} PromptStory
 * @typedef {import('../router.js').AiContext} AiContext
 *
 * @typedef {Object} DigestGroup
 * @property {string} id             g1, g2…
 * @property {string} headline       Plain text, from the model
 * @property {number|null} importance  0 to 100; null if the ranking left it out
 * @property {string} summary        Plain text, from the model
 * @property {string[]} storyIds     Only stories Feedolio gave the model
 *
 * @typedef {Object} Digest
 * @property {DigestGroup[]} groups  Most important first
 * @property {string[]} others       Unread stories in no group
 * @property {string[]} storyIds     Every story the digest covers
 * @property {'decision'|'general'} rankedBy
 * @property {string} model          The general model that grouped and summarised
 * @property {string} generatedAt    ISO
 *
 * @typedef {{ step: 'grouping', stories: number }
 *   | { step: 'ranking', groups: number }
 *   | { step: 'summarising', done: number, groups: number }} DigestStep
 */

/** The digest covers at most this many stories (§7.5). */
export const MAX_DIGEST_STORIES = 60;

/**
 * Groups as the model gave them, keeping only stories Feedolio knows, each
 * in one group, and only groups with a headline and at least one story.
 *
 * @param {{ headline: unknown, storyIds: unknown }[]} raw
 * @param {Set<string>} knownIds
 * @returns {{ id: string, headline: string, storyIds: string[] }[]}
 */
export function cleanGroups(raw, knownIds) {
  const used = new Set();
  /** @type {{ id: string, headline: string, storyIds: string[] }[]} */
  const groups = [];
  for (const group of raw) {
    if (groups.length >= MAX_GROUPS) break;
    const headline =
      typeof group?.headline === 'string'
        ? group.headline.replace(/\s+/g, ' ').trim().slice(0, 120)
        : '';
    /** @type {string[]} */
    const ids = [];
    for (const id of Array.isArray(group?.storyIds) ? group.storyIds : []) {
      if (typeof id === 'string' && knownIds.has(id) && !used.has(id) && !ids.includes(id)) {
        ids.push(id);
      }
    }
    if (!headline || ids.length === 0) continue;
    for (const id of ids) used.add(id);
    groups.push({ id: `g${groups.length + 1}`, headline, storyIds: ids });
  }
  return groups;
}

/**
 * "High", "Medium" or "Low", for a 0 to 100 importance.
 *
 * @param {number|null} importance
 */
export function importanceLabel(importance) {
  if (importance === null) return null;
  if (importance >= 70) return 'High';
  if (importance >= 40) return 'Medium';
  return 'Low';
}

/**
 * Where a digest is kept: per account, catch-up window and model, so opening
 * Catch me up again (or coming back from a source) shows the same digest and
 * costs nothing. "Mark all caught up" starts a new window, and a new digest.
 *
 * @param {{ scope: string|null, window: string, model: string }} parts
 *   window: when the last catch-up was, or "recent" before the first
 */
export function digestKey({ scope, window, model }) {
  return answerKey({ scope, storyId: 'digest', action: window, model });
}

/**
 * @param {{
 *   stories: PromptStory[],
 *   signal?: AbortSignal,
 *   onStep?: (step: DigestStep) => void,
 * }} request
 * @param {AiContext} context
 * @returns {Promise<Digest>}
 */
export async function buildDigest({ stories, signal, onStep }, context) {
  const byId = new Map(stories.map((story) => [story.id, story]));
  onStep?.({ step: 'grouping', stories: stories.length });
  const grouped = await groupStories({ stories, signal }, context);
  const groups = cleanGroups(grouped.groups, new Set(byId.keys()));

  /** @type {'decision'|'general'} */
  let rankedBy = context.settings.decision ? 'decision' : 'general';
  /** @type {Map<string, number>} */
  let importance = new Map();
  /** @type {string[]} */
  let summaries = [];
  if (groups.length > 0) {
    const promptGroups = groups.map((group) => ({
      id: group.id,
      headline: group.headline,
      stories: group.storyIds.map((id) => /** @type {PromptStory} */ (byId.get(id))),
    }));
    onStep?.({ step: 'ranking', groups: groups.length });
    const ranked = await rankGroups({ groups: promptGroups, signal }, context);
    rankedBy = ranked.by;
    importance = new Map(ranked.scores.map((score) => [score.id, score.importance]));

    let done = 0;
    onStep?.({ step: 'summarising', done, groups: groups.length });
    summaries = await Promise.all(
      promptGroups.map(async (group) => {
        const result = await summarizeGroup({ group, signal }, context);
        done += 1;
        onStep?.({ step: 'summarising', done, groups: groups.length });
        return result.text.trim();
      }),
    );
  }

  const groupedIds = new Set(groups.flatMap((group) => group.storyIds));
  return {
    groups: groups
      .map((group, index) => ({
        ...group,
        importance: importance.get(group.id) ?? null,
        summary: summaries[index] ?? '',
      }))
      .sort((a, b) => (b.importance ?? -1) - (a.importance ?? -1)),
    others: stories.filter((story) => !groupedIds.has(story.id)).map((story) => story.id),
    storyIds: stories.map((story) => story.id),
    rankedBy,
    model: grouped.model,
    generatedAt: new Date().toISOString(),
  };
}
