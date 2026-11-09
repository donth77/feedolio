import { feedApi } from '../../feeds/feedApi.js';
import { readAllCached, writeCached } from '../cache.js';
import { describeAiError } from '../errors.js';
import { DECISION_PROVIDERS, GENERAL_PROVIDERS, hostOf, isLocal } from '../providerInfo.js';
import { isReady, judge, roleFor } from '../router.js';
import {
  judgmentKey,
  judgmentsLoaded,
  judgmentsRecorded,
  ruleChecksFinished,
} from './judgmentsSlice.js';
import { rulesJudged, selectAllRules } from './rulesSlice.js';
import { verdictFor } from './verdicts.js';

/**
 * Checks stories against the reader's rules (§7.2, §7.5). Each story is
 * checked once per rule version, in batches of up to 25, and never again on
 * refresh: judgments are saved in IndexedDB and loaded at start-up. Loaded
 * only for readers with rules.
 *
 * @typedef {import('./judgmentsSlice.js').Judgment} Judgment
 * @typedef {import('./judgmentsSlice.js').StorySnapshot} StorySnapshot
 * @typedef {import('./rulesSlice.js').Rule} Rule
 * @typedef {import('../../../lib/types.js').Story} Story
 * @typedef {import('../../../app/store.js').RootState} RootState
 * @typedef {Story & { feedTitle: string }} LoadedStory
 * @typedef {{ getState: () => RootState, dispatch: (action: any) => any, signal?: AbortSignal }} Api
 */

export const BATCH_SIZE = 25;

/** @param {RootState} state */
const scopeOf = (state) => state.auth.user?.id ?? 'guest';

/**
 * Where a judgment is kept in IndexedDB.
 *
 * @param {string} scope
 * @param {{ storyId: string, ruleId: string }} judgment
 */
const storageKey = (scope, judgment) => `${scope}|${judgmentKey(judgment)}`;

/**
 * Reads the current account's judgments into the store.
 *
 * @param {Api} api
 */
export async function loadJudgments({ getState, dispatch }) {
  const scope = scopeOf(getState());
  const saved = /** @type {Judgment[]} */ (await readAllCached('judgments', `${scope}|`));
  // The reader may have switched accounts while this was reading.
  if (scopeOf(getState()) !== scope) return;
  dispatch(judgmentsLoaded(saved.filter(isJudgment)));
}

/** @param {unknown} value @returns {value is Judgment} */
function isJudgment(value) {
  const judgment = /** @type {Record<string, any>} */ (value);
  return (
    typeof judgment?.storyId === 'string' &&
    typeof judgment.ruleId === 'string' &&
    Number.isInteger(judgment.ruleVersion) &&
    ['match', 'maybe', 'no'].includes(judgment.verdict) &&
    typeof judgment.rule?.text === 'string'
  );
}

/**
 * Every story the reader's feeds have loaded, once each.
 *
 * @param {RootState} state
 * @returns {LoadedStory[]}
 */
export function loadedStories(state) {
  const seen = new Set();
  /** @type {LoadedStory[]} */
  const stories = [];
  for (const id of state.subscriptions.ids) {
    const subscription = state.subscriptions.entities[id];
    if (!subscription) continue;
    const { data } = feedApi.endpoints.getFeed.select(subscription.url)(state);
    for (const story of data?.stories ?? []) {
      if (seen.has(story.id)) continue;
      seen.add(story.id);
      stories.push({ ...story, feedTitle: subscription.title });
    }
  }
  return stories;
}

/**
 * The checks still to do: for each rule that's on, the stories not yet
 * judged against its current wording, in batches.
 *
 * @param {{ rules: Rule[], judgments: Record<string, Judgment>, stories: LoadedStory[] }} input
 */
export function planChecks({ rules, judgments, stories }) {
  /** @type {{ rule: Rule, stories: LoadedStory[] }[]} */
  const work = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const todo = stories.filter(
      (story) =>
        judgments[judgmentKey({ storyId: story.id, ruleId: rule.id })]?.ruleVersion !==
        rule.version,
    );
    for (let at = 0; at < todo.length; at += BATCH_SIZE) {
      work.push({ rule, stories: todo.slice(at, at + BATCH_SIZE) });
    }
  }
  return work;
}

/**
 * Enough of a story to list it after it leaves its feed.
 *
 * @param {LoadedStory} story
 * @returns {StorySnapshot}
 */
export function snapshotOf(story) {
  return {
    id: story.id,
    feedId: story.feedId,
    feedTitle: story.feedTitle,
    title: story.title,
    link: story.link,
    publishedAt: story.publishedAt,
    author: story.author,
    excerpt: story.excerpt,
    imageUrl: story.imageUrl,
  };
}

/**
 * Judgments from a model's answers. Stories it didn't answer for are left to
 * the next check.
 *
 * @param {{
 *   rule: Rule,
 *   stories: LoadedStory[],
 *   result: { judgments: { id: string, confidence: number }[], by: 'decision'|'general' },
 *   now: string,
 * }} input
 * @returns {Judgment[]}
 */
export function judgmentsFrom({ rule, stories, result, now }) {
  const byId = new Map(stories.map((story) => [story.id, story]));
  return result.judgments.flatMap(({ id, confidence }) => {
    const story = byId.get(id);
    if (!story) return [];
    const verdict = verdictFor(confidence, result.by);
    return [
      {
        storyId: id,
        ruleId: rule.id,
        ruleVersion: rule.version,
        verdict,
        confidence,
        by: result.by,
        readerSaid: null,
        judgedAt: now,
        rule: { text: rule.text, action: rule.action, tag: rule.tag },
        story: verdict === 'no' ? null : snapshotOf(story),
      },
    ];
  });
}

/**
 * The story as the judging prompt shows it.
 *
 * @param {LoadedStory} story
 */
export function promptStory(story) {
  return { id: story.id, title: story.title, text: story.excerpt, feedTitle: story.feedTitle };
}

/**
 * Saves judgments for the current account. Those a rule might act on, and the
 * reader's answers, are kept for good.
 *
 * @param {RootState} state
 * @param {Judgment[]} judgments
 */
export function saveJudgments(state, judgments) {
  const scope = scopeOf(state);
  return Promise.all(
    judgments.map((judgment) =>
      writeCached('judgments', storageKey(scope, judgment), judgment, {
        keep: judgment.verdict !== 'no' || judgment.readerSaid !== null,
      }),
    ),
  );
}

/**
 * Saves the reader's answer about one story (Maybe, Unhide, or Undo).
 *
 * @param {RootState} state
 * @param {{ storyId: string, ruleId: string }} which
 */
export async function saveAnswer(state, which) {
  const judgment = state.judgments.entities[judgmentKey(which)];
  if (judgment) await saveJudgments(state, [judgment]);
}

/**
 * Runs every check still to do, saving as it goes. Stops quietly when AI
 * isn't ready, and stops with a reason the reader can see when a provider
 * fails; the next new stories or rule change try again.
 *
 * @param {Api} api
 */
export async function runRuleChecks(api) {
  const state = api.getState();
  const context = { settings: state.aiSettings, userId: state.auth.user?.id ?? null };
  if (!state.aiSettings.features.rules || !state.judgments.loaded) return;
  if (!isReady('general', context)) return;

  const work = planChecks({
    rules: selectAllRules(state),
    judgments: state.judgments.entities,
    stories: loadedStories(state),
  });
  if (work.length === 0) return;

  /** @type {'decision'|'general'|null} */
  let by = null;
  try {
    for (const batch of work) {
      if (api.signal?.aborted) return;
      const result = await judge(
        { rule: batch.rule.text, stories: batch.stories.map(promptStory), signal: api.signal },
        context,
      );
      by = result.by;
      const judgments = judgmentsFrom({ ...batch, result, now: new Date().toISOString() });
      api.dispatch(judgmentsRecorded(judgments));
      if (!api.getState().rules.judged) api.dispatch(rulesJudged());
      await saveJudgments(api.getState(), judgments);
    }
    api.dispatch(ruleChecksFinished({ at: new Date().toISOString(), by, error: null }));
  } catch (error) {
    if (api.signal?.aborted || /** @type {{ code?: string }} */ (error)?.code === 'aborted') return;
    const { general, decision } = state.aiSettings;
    const where =
      roleFor('match', context) === 'decision' && decision
        ? {
            label: DECISION_PROVIDERS[decision.provider].label,
            host: hostOf(DECISION_PROVIDERS[decision.provider].baseUrl),
            decision: decision.provider,
          }
        : {
            label: general ? GENERAL_PROVIDERS[general.provider].label : 'Your provider',
            host: general ? hostOf(general.baseUrl) : '',
            local: general ? isLocal(general.baseUrl) : false,
          };
    api.dispatch(
      ruleChecksFinished({ at: state.judgments.run.at, by, error: describeAiError(error, where) }),
    );
  }
}
