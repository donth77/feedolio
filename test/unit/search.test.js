import { describe, expect, it } from 'vitest';
import { fold, matchRanges, searchStories } from '../../src/features/search/matchStories.js';

/**
 * A listed story with just what search reads.
 *
 * @param {string} title
 * @param {{ excerpt?: string, author?: string|null, feed?: string, publishedAt?: string|null }} [rest]
 */
function item(title, { excerpt = '', author = null, feed = 'News', publishedAt = null } = {}) {
  return /** @type {any} */ ({
    story: { id: `s_${title.length}_${title.slice(0, 6)}`, title, excerpt, author, publishedAt },
    feed: { title: feed },
  });
}

/** @param {any[]} results */
const titles = (results) => results.map(({ story }) => story.title);

const STORIES = [
  item('AI stocks climb after trillions wiped from market values', {
    excerpt: 'Chip makers led the recovery.',
    feed: 'BBC Technology',
    publishedAt: '2026-11-06T18:00:00Z',
  }),
  item('Nvidia said demand was strong', {
    excerpt: 'Its chips sold out again.',
    author: 'Ada Lovelace',
    publishedAt: '2026-11-05T12:00:00Z',
  }),
  item('A café opens on the moon', { excerpt: 'Coffee, but in space.', publishedAt: null }),
  item('TechCrunch Founder Summit 2026: Doors open at 9 a.m.', {
    excerpt: 'Founders summit in Boston.',
    feed: 'TechCrunch Startups',
    publishedAt: '2026-11-04T09:00:00Z',
  }),
  item('Air quality apps are booming', { publishedAt: '2026-11-06T08:00:00Z' }),
];

describe('Search (T-34)', () => {
  it('needs every word, ignoring case and accents, and lists the newest first', () => {
    expect(titles(searchStories(STORIES, 'chip'))).toEqual([
      'AI stocks climb after trillions wiped from market values',
      'Nvidia said demand was strong',
    ]);
    expect(titles(searchStories(STORIES, 'NVIDIA chips'))).toEqual([
      'Nvidia said demand was strong',
    ]);
    expect(titles(searchStories(STORIES, 'cafe'))).toEqual(['A café opens on the moon']);
    expect(titles(searchStories(STORIES, 'CAFÉ moon'))).toEqual(['A café opens on the moon']);
    expect(searchStories(STORIES, 'nvidia boston')).toEqual([]);
  });

  it('keeps short words whole, plurals aside, and lets longer ones finish a word', () => {
    // "AI" is in neither "said" nor "Air".
    expect(titles(searchStories(STORIES, 'ai'))).toEqual([
      'AI stocks climb after trillions wiped from market values',
    ]);
    expect(titles(searchStories(STORIES, 'app'))).toEqual(['Air quality apps are booming']);
    expect(titles(searchStories(STORIES, 'boom'))).toEqual(['Air quality apps are booming']);
    // Punctuation at a word's edge is ignored.
    expect(titles(searchStories(STORIES, '(Nvidia),'))).toEqual(['Nvidia said demand was strong']);
  });

  it('matches a quoted phrase only as written', () => {
    expect(titles(searchStories(STORIES, '"founder summit"'))).toEqual([
      'TechCrunch Founder Summit 2026: Doors open at 9 a.m.',
    ]);
    expect(searchStories(STORIES, '"summit founder"')).toEqual([]);
    // Curly quotes count, and an unfinished quote still searches.
    expect(titles(searchStories(STORIES, '“doors open'))).toEqual([
      'TechCrunch Founder Summit 2026: Doors open at 9 a.m.',
    ]);
    expect(searchStories(STORIES, '""')).toEqual([]);
  });

  it('searches the title, summary, author and feed name, or only the title', () => {
    expect(titles(searchStories(STORIES, 'lovelace'))).toEqual(['Nvidia said demand was strong']);
    expect(titles(searchStories(STORIES, 'bbc'))).toEqual([
      'AI stocks climb after trillions wiped from market values',
    ]);
    expect(searchStories(STORIES, 'chips', { titlesOnly: true })).toEqual([]);
    expect(titles(searchStories(STORIES, 'stocks', { titlesOnly: true }))).toHaveLength(1);
    // A phrase can't run from the title into the summary.
    expect(searchStories(STORIES, '"strong its"')).toEqual([]);
  });

  it('can keep only stories published since a time', () => {
    const since = Date.parse('2026-11-06T00:00:00Z');
    expect(titles(searchStories(STORIES, 'chip', { since }))).toEqual([
      'AI stocks climb after trillions wiped from market values',
    ]);
    // Undated stories have no publish time to compare.
    expect(searchStories(STORIES, 'cafe', { since })).toEqual([]);
  });

  it('matches nothing for an empty query', () => {
    expect(searchStories(STORIES, '')).toEqual([]);
    expect(searchStories(STORIES, '   ')).toEqual([]);
    expect(searchStories(STORIES, '-- ...')).toEqual([]);
  });

  it('finds where matches are in the original text, for highlighting', () => {
    const text = 'Café owners say AI helps; the café’s AI is new';
    expect(matchRanges(text, 'cafe ai').map(([start, end]) => text.slice(start, end))).toEqual([
      'Café',
      'AI',
      'café',
      'AI',
    ]);
    // Overlapping matches merge into one.
    expect(matchRanges('Founder Summit', '"founder summit" summit')).toEqual([[0, 14]]);
    expect(matchRanges('', 'ai')).toEqual([]);
    expect(matchRanges('AI', '')).toEqual([]);
  });

  it('puts undated stories last, keeps equal times in order, and gives the same answer twice', () => {
    const list = [
      item('Undated one', { feed: 'Daily News' }),
      item('Morning brief', { feed: 'Daily News', publishedAt: '2026-11-06T08:00:00Z' }),
      item('Undated two', { feed: 'Daily News' }),
      item('Evening brief', { feed: 'Daily News', publishedAt: '2026-11-06T20:00:00Z' }),
      item('Also morning', { feed: 'Daily News', publishedAt: '2026-11-06T08:00:00Z' }),
    ];
    const expected = [
      'Evening brief',
      'Morning brief',
      'Also morning',
      'Undated one',
      'Undated two',
    ];
    expect(titles(searchStories(list, 'daily'))).toEqual(expected);
    // The second search reads each story's folded text from the cache.
    expect(titles(searchStories(list, 'daily'))).toEqual(expected);
    expect(titles(searchStories(list, 'brief', { titlesOnly: true }))).toHaveLength(2);
    expect(titles(searchStories(list, 'brief', { titlesOnly: true }))).toHaveLength(2);
  });

  it('folds text without losing track of where each character came from', () => {
    const { folded, starts, ends } = fold('Éclair ﬁx');
    expect(folded).toBe('eclair fix');
    // The "fi" ligature is one character that folds to two.
    expect(starts.slice(-3)).toEqual([7, 7, 8]);
    expect(ends.slice(-3)).toEqual([8, 8, 9]);
  });
});
