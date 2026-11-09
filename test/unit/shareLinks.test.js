import { describe, expect, it } from 'vitest';
import { shareLinks } from '../../src/features/share/shareLinks.js';

describe('shareLinks', () => {
  const story = {
    title: 'Q&A: why “cheap” AI #costs? 50% more',
    url: 'https://news.test/2026/11/q-a?ref=rss&id=7#top',
  };

  it('builds each network’s share page for the original link', () => {
    const links = shareLinks(story);

    const x = new URL(links.x);
    expect(`${x.origin}${x.pathname}`).toBe('https://x.com/intent/post');
    expect(x.searchParams.get('text')).toBe(story.title);
    expect(x.searchParams.get('url')).toBe(story.url);

    const facebook = new URL(links.facebook);
    expect(`${facebook.origin}${facebook.pathname}`).toBe(
      'https://www.facebook.com/sharer/sharer.php',
    );
    expect([...facebook.searchParams]).toEqual([['u', story.url]]);

    const linkedin = new URL(links.linkedin);
    expect(`${linkedin.origin}${linkedin.pathname}`).toBe(
      'https://www.linkedin.com/sharing/share-offsite/',
    );
    expect([...linkedin.searchParams]).toEqual([['url', story.url]]);
  });

  it('writes an email with the title as subject and the link in the body', () => {
    const { email } = shareLinks(story);

    expect(email.startsWith('mailto:?subject=')).toBe(true);
    // Mail apps read + literally, so spaces must be %20.
    expect(email).not.toContain('+');
    const params = new URLSearchParams(email.slice('mailto:?'.length));
    expect(params.get('subject')).toBe(story.title);
    expect(params.get('body')).toBe(`${story.title}\n\n${story.url}`);
  });
});
