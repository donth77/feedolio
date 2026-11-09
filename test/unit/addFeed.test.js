import { describe, expect, it } from 'vitest';
import {
  addFeedProblem,
  postingLabel,
  toFeedAddress,
} from '../../src/features/subscriptions/addFeed.js';

describe('toFeedAddress', () => {
  it.each([
    ['theverge.com', 'https://theverge.com/'],
    ['  https://example.com/feed  ', 'https://example.com/feed'],
    ['http://example.com/rss', 'http://example.com/rss'],
    ['example.com:8080/feed', 'https://example.com:8080/feed'],
    ['[2001:db8::1]/feed', 'https://[2001:db8::1]/feed'],
  ])('reads %j as %s', (input, url) => {
    expect(toFeedAddress(input)).toEqual({ url });
  });

  it.each([
    ['', 'Paste the address of a website or a feed.'],
    ['   ', 'Paste the address of a website or a feed.'],
    ['not a link', 'That doesn’t look like a web address.'],
    ['localhost', 'That doesn’t look like a web address.'],
    ['https://', 'That doesn’t look like a web address.'],
    ['ftp://example.com/feed', 'Use a web address, starting with http:// or https://.'],
    [
      'https://me:secret@example.com/feed',
      'Addresses with a username or password aren’t supported.',
    ],
  ])('turns %j away', (input, error) => {
    expect(toFeedAddress(input)).toEqual({ error });
  });
});

describe('postingLabel', () => {
  const NOW = Date.parse('2026-11-06T21:00:00Z');
  const date = (/** @type {string} */ iso) => `on ${iso.slice(0, 10)}`;
  const recent = '2026-11-06T10:00:00Z';

  it('says how often a feed posts', () => {
    expect(postingLabel(70 * 7, recent, NOW, date)).toBe('About 70 posts a day');
    expect(postingLabel(14, recent, NOW, date)).toBe('About 2 posts a day');
    expect(postingLabel(4, recent, NOW, date)).toBe('About 4 posts a week');
    expect(postingLabel(1, recent, NOW, date)).toBe('About 1 post a week');
    expect(postingLabel(0, recent, NOW, date)).toBe('Less than one post a week');
    expect(postingLabel(null, recent, NOW, date)).toBeNull();
    expect(postingLabel(null, null, NOW, date)).toBeNull();
  });

  it('says when a feed went quiet instead', () => {
    expect(postingLabel(0, '2018-01-03T20:00:05Z', NOW, date)).toBe(
      'No new stories since on 2018-01-03',
    );
  });
});

describe('addFeedProblem', () => {
  /** @param {string} code @param {string} [message] */
  const failure = (code, message = 'From the Worker.') => ({
    status: 422,
    data: { error: { code, message } },
  });

  it.each([
    [
      'NO_FEED_FOUND',
      'We couldn’t find a feed at that address.',
      'Try the site’s homepage, or a link that ends in /feed or /rss.',
    ],
    ['NOT_A_FEED', 'That address isn’t a feed.', 'From the Worker.'],
    ['INVALID_URL', 'That doesn’t look like a web address.', 'From the Worker.'],
    ['BLOCKED_HOST', 'Feedolio can’t read feeds from that address.', 'From the Worker.'],
    ['UPSTREAM_TIMEOUT', 'The site didn’t answer in time.', 'Try again in a moment.'],
    ['TOO_LARGE', 'That feed is too large.', 'From the Worker.'],
    ['UPSTREAM_ERROR', 'The site couldn’t be read.', 'From the Worker.'],
  ])('explains %s', (code, title, detail) => {
    expect(addFeedProblem(failure(code))).toEqual({ title, detail });
  });

  it('explains a network failure, and anything unexpected', () => {
    expect(addFeedProblem({ status: 'FETCH_ERROR', error: 'TypeError' })).toEqual({
      title: 'Feedolio couldn’t check that link.',
      detail: 'You might be offline.',
    });
    expect(addFeedProblem({ status: 500, data: 'oops' })).toEqual({
      title: 'Something went wrong.',
      detail: 'Try again in a moment.',
    });
    expect(addFeedProblem(undefined).title).toBe('Something went wrong.');
    expect(addFeedProblem({ data: { error: { code: 'NOT_A_FEED' } } }).detail).toBe('');
  });
});
