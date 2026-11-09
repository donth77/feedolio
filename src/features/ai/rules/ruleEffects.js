import { createSelector } from '@reduxjs/toolkit';
import { selectJudgmentEntities } from './judgmentsSlice.js';
import { selectRuleEntities } from './rulesSlice.js';
import { applies, ruleLabel } from './verdicts.js';

/**
 * What the reader's rules mean for each story, for the lists and views.
 *
 * - Hidden is sticky: a story stays in Hidden until the reader unhides it,
 *   even if the rule that hid it is switched off, edited or removed (US-108).
 * - Highlights, tags and Maybe come only from rules that are on, as they now
 *   read (judgments for an older wording wait to be checked again).
 *
 * @typedef {import('./judgmentsSlice.js').Judgment} Judgment
 * @typedef {import('./rulesSlice.js').Rule} Rule
 *
 * @typedef {Object} StoryEffects
 * @property {string|null} highlight   The highlighting rule's short name
 * @property {string[]} tags
 * @property {{ ruleId: string, label: string, tag: string|null }[]} maybes
 */

/**
 * @param {Judgment} judgment
 * @param {Record<string, Rule|undefined>} rules
 */
function currentRuleFor(judgment, rules) {
  const rule = rules[judgment.ruleId];
  return rule && rule.enabled && rule.version === judgment.ruleVersion ? rule : null;
}

/** Stories the rules hid, most recently judged first. */
export const selectHiddenJudgments = createSelector([selectJudgmentEntities], (entities) =>
  Object.values(entities)
    .filter((judgment) => judgment.rule.action === 'hide' && applies(judgment) && judgment.story)
    .sort((a, b) => b.judgedAt.localeCompare(a.judgedAt)),
);

/** Ids of hidden stories, to leave out of lists. */
export const selectHiddenIds = createSelector(
  [selectHiddenJudgments],
  (hidden) => new Set(hidden.map((judgment) => judgment.storyId)),
);

/** Stories waiting for the reader's answer in Maybe, newest first. */
export const selectMaybeJudgments = createSelector(
  [selectJudgmentEntities, selectRuleEntities, selectHiddenIds],
  (entities, rules, hiddenIds) =>
    Object.values(entities)
      .filter(
        (judgment) =>
          judgment.verdict === 'maybe' &&
          judgment.readerSaid === null &&
          judgment.story &&
          !hiddenIds.has(judgment.storyId) &&
          currentRuleFor(judgment, rules),
      )
      .sort((a, b) => (b.story?.publishedAt ?? '').localeCompare(a.story?.publishedAt ?? '')),
);

/** Highlights, tags and open questions per story id. */
export const selectStoryEffects = createSelector(
  [selectJudgmentEntities, selectRuleEntities],
  (entities, rules) => {
    /** @type {Map<string, StoryEffects>} */
    const effects = new Map();
    /** @param {string} id */
    const of = (id) => {
      let effect = effects.get(id);
      if (!effect) {
        effect = { highlight: null, tags: [], maybes: [] };
        effects.set(id, effect);
      }
      return effect;
    };
    for (const judgment of Object.values(entities)) {
      const rule = currentRuleFor(judgment, rules);
      if (!rule) continue;
      if (judgment.verdict === 'maybe' && judgment.readerSaid === null) {
        of(judgment.storyId).maybes.push({
          ruleId: rule.id,
          label: ruleLabel(rule.text),
          tag: rule.tag,
        });
      } else if (applies(judgment)) {
        const effect = of(judgment.storyId);
        if (rule.action === 'highlight') effect.highlight ??= ruleLabel(rule.text);
        if (rule.action === 'tag' && rule.tag && !effect.tags.includes(rule.tag)) {
          effect.tags.push(rule.tag);
        }
      }
    }
    return effects;
  },
);

/** Tagged stories by tag, each list newest first. */
export const selectTagged = createSelector(
  [selectJudgmentEntities, selectRuleEntities, selectHiddenIds],
  (entities, rules, hiddenIds) => {
    /** @type {Map<string, Judgment[]>} */
    const tagged = new Map();
    for (const judgment of Object.values(entities)) {
      const rule = currentRuleFor(judgment, rules);
      if (!rule || rule.action !== 'tag' || !rule.tag || !applies(judgment)) continue;
      if (!judgment.story || hiddenIds.has(judgment.storyId)) continue;
      const list = tagged.get(rule.tag) ?? [];
      if (!list.some((other) => other.storyId === judgment.storyId)) list.push(judgment);
      tagged.set(rule.tag, list);
    }
    for (const list of tagged.values()) {
      list.sort((a, b) => (b.story?.publishedAt ?? '').localeCompare(a.story?.publishedAt ?? ''));
    }
    return new Map([...tagged].sort(([a], [b]) => a.localeCompare(b)));
  },
);
