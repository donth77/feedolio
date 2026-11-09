import { createSlice } from '@reduxjs/toolkit';

/**
 * What the reader's rules decided about each story, loaded from IndexedDB
 * (see ruleChecks.js) and kept here for the lists to read. Not saved with the
 * reader's other data: there can be thousands, so they live in IndexedDB.
 *
 * @typedef {import('./rulesSlice.js').RuleAction} RuleAction
 *
 * @typedef {Object} StorySnapshot   Enough of a story to list it after it leaves its feed
 * @property {string} id
 * @property {string} feedId
 * @property {string} feedTitle
 * @property {string} title
 * @property {string} link
 * @property {string|null} publishedAt
 * @property {string|null} author
 * @property {string} excerpt
 * @property {string|null} imageUrl
 *
 * @typedef {Object} Judgment
 * @property {string} storyId
 * @property {string} ruleId
 * @property {number} ruleVersion
 * @property {'match'|'maybe'|'no'} verdict
 * @property {number} confidence   Probability of a match, 0 to 1
 * @property {'decision'|'general'} by
 * @property {'yes'|'no'|null} readerSaid  The reader's answer wins over the model
 * @property {string} judgedAt      ISO
 * @property {{ text: string, action: RuleAction, tag: string|null }} rule  As it was
 * @property {StorySnapshot|null} story  Kept when the rule might act on the story
 *
 * @typedef {Object} RuleRun
 * @property {string|null} at      When rules last finished checking
 * @property {'decision'|'general'|null} by
 * @property {string|null} error   Why the last check stopped
 */

/** @param {{ storyId: string, ruleId: string }} judgment */
export const judgmentKey = ({ storyId, ruleId }) => `${storyId}|${ruleId}`;

const initialState = {
  /** @type {Record<string, Judgment>} */
  entities: {},
  /** Judgments for this account have been read from IndexedDB. */
  loaded: false,
  /** @type {RuleRun} */
  run: { at: null, by: null, error: null },
};

const judgmentsSlice = createSlice({
  name: 'judgments',
  initialState,
  reducers: {
    /** @param {{ payload: Judgment[] }} action */
    judgmentsLoaded(state, { payload }) {
      state.entities = Object.fromEntries(
        payload.map((judgment) => [judgmentKey(judgment), judgment]),
      );
      state.loaded = true;
    },
    /** @param {{ payload: Judgment[] }} action */
    judgmentsRecorded(state, { payload }) {
      for (const judgment of payload) state.entities[judgmentKey(judgment)] = judgment;
    },
    /**
     * The reader's answer in Maybe, or Unhide (an answer of "no"); null takes
     * it back.
     *
     * @param {{ payload: { storyId: string, ruleId: string, readerSaid: 'yes'|'no'|null } }} action
     */
    judgmentAnswered(state, { payload }) {
      const judgment = state.entities[judgmentKey(payload)];
      if (judgment) judgment.readerSaid = payload.readerSaid;
    },
    /** Another account is shown: its judgments load next. */
    judgmentsCleared() {
      return initialState;
    },
    /** @param {{ payload: RuleRun }} action */
    ruleChecksFinished(state, { payload }) {
      state.run = payload;
    },
  },
});

export const {
  judgmentsLoaded,
  judgmentsRecorded,
  judgmentAnswered,
  judgmentsCleared,
  ruleChecksFinished,
} = judgmentsSlice.actions;
export default judgmentsSlice.reducer;

/** @param {{ judgments: typeof initialState }} state */
export const selectJudgmentEntities = (state) => state.judgments.entities;
/** @param {{ judgments: typeof initialState }} state */
export const selectJudgmentsLoaded = (state) => state.judgments.loaded;
/** @param {{ judgments: typeof initialState }} state */
export const selectRuleRun = (state) => state.judgments.run;
