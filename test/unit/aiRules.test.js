import { describe, expect, it } from 'vitest';
import { judgmentsFrom, planChecks, promptStory } from '../../src/features/ai/rules/ruleChecks.js';
import {
  selectHiddenIds,
  selectHiddenJudgments,
  selectMaybeJudgments,
  selectStoryEffects,
  selectTagged,
} from '../../src/features/ai/rules/ruleEffects.js';
import { cleanTag, restoreRules } from '../../src/features/ai/rules/rulesSlice.js';
import { applies, ruleLabel, verdictFor } from '../../src/features/ai/rules/verdicts.js';

/** @typedef {import('../../src/features/ai/rules/judgmentsSlice.js').Judgment} Judgment */

const NOW = '2026-11-09T12:00:00.000Z';

/** @param {Partial<import('../../src/features/ai/rules/rulesSlice.js').Rule>} rule */
const rule = (rule) => ({
  id: 'r1',
  text: 'Hide event announcements and conference promotions',
  action: /** @type {const} */ ('hide'),
  tag: null,
  enabled: true,
  version: 1,
  createdAt: NOW,
  ...rule,
});

/** @param {string} id */
const story = (id) => ({
  id,
  feedId: 'f_1',
  feedTitle: 'TechCrunch',
  title: `Story ${id}`,
  link: `https://news.test/${id}`,
  publishedAt: `2026-11-0${id.length}T00:00:00.000Z`,
  author: null,
  excerpt: `About ${id}`,
  imageUrl: null,
  contentHtml: '<p>Body</p>',
  hasFullContent: true,
  categories: [],
  imageSource: null,
});

/**
 * @param {Partial<Judgment>} judgment
 * @returns {Judgment}
 */
const judged = (judgment) => ({
  storyId: 's1',
  ruleId: 'r1',
  ruleVersion: 1,
  verdict: 'match',
  confidence: 0.9,
  by: 'decision',
  readerSaid: null,
  judgedAt: NOW,
  rule: { text: 'Hide event announcements', action: 'hide', tag: null },
  story: /** @type {any} */ ({ ...story(judgment.storyId ?? 's1'), feedTitle: 'TechCrunch' }),
  ...judgment,
});

/**
 * A store state with these rules and judgments.
 *
 * @param {ReturnType<typeof rule>[]} rules
 * @param {Judgment[]} judgments
 */
function state(rules, judgments) {
  return /** @type {any} */ ({
    rules: restoreRules({ list: rules }),
    judgments: {
      entities: Object.fromEntries(judgments.map((j) => [`${j.storyId}|${j.ruleId}`, j])),
      loaded: true,
      run: { at: null, by: null, error: null },
    },
  });
}

describe('Verdicts', () => {
  it('use the decision model’s narrower Maybe band, and the general model’s wider one (ADR-008)', () => {
    expect(verdictFor(0.75, 'decision')).toBe('match');
    expect(verdictFor(0.74, 'decision')).toBe('maybe');
    expect(verdictFor(0.4, 'decision')).toBe('maybe');
    expect(verdictFor(0.39, 'decision')).toBe('no');
    expect(verdictFor(0.85, 'general')).toBe('match');
    expect(verdictFor(0.8, 'general')).toBe('maybe');
    expect(verdictFor(0.3, 'general')).toBe('maybe');
    expect(verdictFor(0.29, 'general')).toBe('no');
  });

  it('let the reader’s answer win over the model', () => {
    expect(applies({ verdict: 'match', readerSaid: null })).toBe(true);
    expect(applies({ verdict: 'match', readerSaid: 'no' })).toBe(false);
    expect(applies({ verdict: 'maybe', readerSaid: 'yes' })).toBe(true);
    expect(applies({ verdict: 'no', readerSaid: null })).toBe(false);
  });

  it('give each rule a short name', () => {
    expect(ruleLabel('Hide event announcements and conference promotions')).toBe(
      'Event announcements',
    );
    expect(ruleLabel('Highlight new AI devices and gadgets')).toBe('New AI devices');
    expect(ruleLabel('Tag startup funding and valuation news as Funding')).toBe('Startup funding');
    expect(ruleLabel('Please hide any crypto price chatter.')).toBe('Crypto price chatter');
    expect(
      ruleLabel('stories about the long-running and very complicated saga of the merger'),
    ).toBe('Stories about the long-running');
    expect(
      ruleLabel(
        'stories about long-running, very complicated international trade disputes everywhere',
      ),
    ).toBe('Stories about long-running');
    expect(
      ruleLabel(
        'stories about the extraordinarily complicated international trade disputes everywhere',
      ),
    ).toBe('Stories about the extraordinarily…');
    expect(ruleLabel('Hide')).toBe('Hide');
  });
});

describe('Saved rules', () => {
  it('keep only rules that look right, and tidy tags', () => {
    const restored = restoreRules({
      list: [
        rule({}),
        rule({ id: 'r2', action: 'tag', tag: '  Funding   news ' }),
        rule({ id: 'r3', action: 'tag', tag: '   ' }),
        rule({ id: 'r4', action: 'delete' }),
        rule({ id: 'r5', text: '  ' }),
        rule({ id: 'r6', action: 'highlight', tag: 'ignored' }),
        null,
      ],
      judged: true,
    });
    expect(restored.ids).toEqual(['r1', 'r2', 'r6']);
    expect(restored.entities.r2?.tag).toBe('Funding news');
    expect(restored.entities.r6?.tag).toBeNull();
    expect(restored.judged).toBe(true);
    expect(restoreRules(undefined).ids).toEqual([]);
    expect(cleanTag('x'.repeat(40))).toHaveLength(30);
    expect(cleanTag(null)).toBeNull();
  });
});

describe('Rule checks', () => {
  it('check each story once per rule version, in batches of 25', () => {
    const stories = Array.from({ length: 30 }, (_, index) => story(`s${index}`));
    const work = planChecks({
      rules: [rule({}), rule({ id: 'r2', enabled: false }), rule({ id: 'r3', version: 2 })],
      judgments: {
        's0|r1': judged({ storyId: 's0' }),
        's1|r3': judged({ storyId: 's1', ruleId: 'r3', ruleVersion: 1 }),
        's2|r3': judged({ storyId: 's2', ruleId: 'r3', ruleVersion: 2 }),
      },
      stories,
    });
    expect(work.map((batch) => [batch.rule.id, batch.stories.length])).toEqual([
      ['r1', 25],
      ['r1', 4],
      ['r3', 25],
      ['r3', 4],
    ]);
    expect(work[2].stories.map((s) => s.id)).toContain('s1');
    expect(work[2].stories.map((s) => s.id)).not.toContain('s2');
  });

  it('turn answers into judgments, keeping a copy of stories a rule might act on', () => {
    const batch = { rule: rule({ version: 3 }), stories: [story('s1'), story('s2'), story('s3')] };
    const judgments = judgmentsFrom({
      ...batch,
      result: {
        by: 'decision',
        judgments: [
          { id: 's1', confidence: 0.93 },
          { id: 's2', confidence: 0.5 },
          { id: 's3', confidence: 0.1 },
          { id: 'made-up', confidence: 1 },
        ],
      },
      now: NOW,
    });
    expect(judgments.map((j) => [j.storyId, j.verdict, j.ruleVersion, Boolean(j.story)])).toEqual([
      ['s1', 'match', 3, true],
      ['s2', 'maybe', 3, true],
      ['s3', 'no', 3, false],
    ]);
    expect(judgments[0].story).toEqual({
      id: 's1',
      feedId: 'f_1',
      feedTitle: 'TechCrunch',
      title: 'Story s1',
      link: 'https://news.test/s1',
      publishedAt: '2026-11-02T00:00:00.000Z',
      author: null,
      excerpt: 'About s1',
      imageUrl: null,
    });
    expect(judgments[0].rule).toEqual({ text: batch.rule.text, action: 'hide', tag: null });
    expect(promptStory(story('s1'))).toEqual({
      id: 's1',
      title: 'Story s1',
      text: 'About s1',
      feedTitle: 'TechCrunch',
    });
  });
});

describe('Rule effects', () => {
  const rules = [
    rule({ id: 'hide' }),
    rule({ id: 'tag', action: 'tag', tag: 'Funding', text: 'Tag funding news as Funding' }),
    rule({ id: 'light', action: 'highlight', text: 'Highlight new AI devices' }),
    rule({ id: 'off', action: 'highlight', enabled: false }),
  ];

  it('keep hidden stories hidden, even after their rule goes, until unhidden (US-108)', () => {
    const current = state(rules, [
      judged({ storyId: 'a', ruleId: 'hide', judgedAt: '2026-11-09T10:00:00.000Z' }),
      judged({ storyId: 'b', ruleId: 'gone', judgedAt: '2026-11-09T11:00:00.000Z' }),
      judged({ storyId: 'c', ruleId: 'hide', readerSaid: 'no' }),
      judged({ storyId: 'd', ruleId: 'hide', verdict: 'maybe', readerSaid: 'yes' }),
      judged({ storyId: 'e', ruleId: 'hide', verdict: 'no', story: null }),
    ]);
    expect(selectHiddenJudgments(current).map((j) => j.storyId)).toEqual(['d', 'b', 'a']);
    expect([...selectHiddenIds(current)].sort()).toEqual(['a', 'b', 'd']);
  });

  it('show highlights, tags and open questions only for rules that are on, as they now read', () => {
    const current = state(rules, [
      judged({ storyId: 'a', ruleId: 'tag', rule: { text: '', action: 'tag', tag: 'Funding' } }),
      judged({ storyId: 'a', ruleId: 'light', rule: { text: '', action: 'highlight', tag: null } }),
      judged({
        storyId: 'b',
        ruleId: 'tag',
        verdict: 'maybe',
        rule: { text: '', action: 'tag', tag: 'Funding' },
      }),
      judged({ storyId: 'c', ruleId: 'off', rule: { text: '', action: 'highlight', tag: null } }),
      judged({
        storyId: 'd',
        ruleId: 'tag',
        ruleVersion: 0,
        rule: { text: '', action: 'tag', tag: 'Funding' },
      }),
      judged({ storyId: 'e', ruleId: 'hide', verdict: 'maybe' }),
      judged({
        storyId: 'f',
        ruleId: 'tag',
        verdict: 'no',
        story: null,
        rule: { text: '', action: 'tag', tag: 'Funding' },
      }),
    ]);
    const effects = selectStoryEffects(current);
    expect(effects.get('a')).toEqual({
      highlight: 'New AI devices',
      tags: ['Funding'],
      maybes: [],
    });
    expect(effects.get('b')).toEqual({
      highlight: null,
      tags: [],
      maybes: [{ ruleId: 'tag', label: 'Funding news', tag: 'Funding' }],
    });
    expect(effects.has('c')).toBe(false);
    expect(effects.has('d')).toBe(false);
    expect(effects.get('e')?.maybes[0].label).toBe('Event announcements');
    expect(effects.has('f')).toBe(false);

    expect(
      selectMaybeJudgments(current)
        .map((j) => j.storyId)
        .sort(),
    ).toEqual(['b', 'e']);
    expect(
      [...selectTagged(current)].map(([tag, list]) => [tag, list.map((j) => j.storyId)]),
    ).toEqual([['Funding', ['a']]]);
  });

  it('leave hidden stories out of Maybe and tag lists', () => {
    const current = state(rules, [
      judged({ storyId: 'a', ruleId: 'hide' }),
      judged({ storyId: 'a', ruleId: 'tag', rule: { text: '', action: 'tag', tag: 'Funding' } }),
      judged({
        storyId: 'a',
        ruleId: 'light',
        verdict: 'maybe',
        rule: { text: '', action: 'highlight', tag: null },
      }),
      judged({
        storyId: 'b',
        ruleId: 'tag',
        rule: { text: '', action: 'tag', tag: 'Funding' },
        story: /** @type {any} */ ({ ...story('bb'), publishedAt: '2026-11-08T00:00:00.000Z' }),
      }),
      judged({
        storyId: 'c',
        ruleId: 'tag',
        rule: { text: '', action: 'tag', tag: 'Funding' },
        story: /** @type {any} */ ({ ...story('c'), publishedAt: '2026-11-09T00:00:00.000Z' }),
      }),
    ]);
    expect(selectMaybeJudgments(current)).toEqual([]);
    expect(
      selectTagged(current)
        .get('Funding')
        ?.map((j) => j.storyId),
    ).toEqual(['c', 'b']);
  });
});
