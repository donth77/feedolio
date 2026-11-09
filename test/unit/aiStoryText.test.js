// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { actionPrompt, actionSystem } from '../../src/features/ai/prompts.js';
import { MAX_STORY_CHARS, storyPlainText, tidy } from '../../src/features/ai/storyText.js';

/** @param {string} html */
const fragment = (html) => document.createRange().createContextualFragment(html);

describe('A story as plain text', () => {
  it('keeps paragraphs, headings, lists and line breaks', () => {
    const text = storyPlainText(
      fragment(
        '<h2>Why it matters</h2><p>First   paragraph,\n with <a href="https://x.test">a link</a> and <em>emphasis</em>.</p>' +
          '<ul><li>One</li><li>Two <strong>bold</strong></li></ul>' +
          '<blockquote><p>A quote</p></blockquote><p>Line one<br>Line two</p>',
      ),
    );
    expect(text).toBe(
      'Why it matters\n\nFirst paragraph, with a link and emphasis.\n\n- One\n- Two bold\n\nA quote\n\nLine one\nLine two',
    );
  });

  it('leaves out pictures and embedded media', () => {
    const text = storyPlainText(
      fragment(
        '<p>Before</p><figure><img src="https://x.test/a.png" alt="A chart"><figcaption>The caption</figcaption></figure>' +
          '<a data-embed href="https://x.test">Embedded media Not shown here. View it on x.test</a><p>After</p><!-- note -->',
      ),
    );
    expect(text).toBe('Before\n\nThe caption\n\nAfter');
  });

  it('caps very long stories at a paragraph break, and says so', () => {
    const paragraph = 'word '.repeat(2000).trim();
    const long = Array.from({ length: 12 }, () => paragraph).join('\n\n');
    const capped = tidy(long);
    expect(capped.length).toBeLessThan(MAX_STORY_CHARS + 60);
    expect(capped).toMatch(/word\n\n\[The story goes on; this is the first part\.\]$/);

    const unbroken = 'x'.repeat(MAX_STORY_CHARS + 10);
    expect(tidy(unbroken)).toHaveLength(
      MAX_STORY_CHARS + '\n\n[The story goes on; this is the first part.]'.length,
    );
  });
});

describe('Story-page prompts', () => {
  it('ask for plain text, fence the story, and mention summary-only feeds', () => {
    expect(actionSystem('summarize')).toMatch(
      /^You summarise news stories.*three to five short bullet points/,
    );
    expect(actionSystem('summarize')).toContain('No HTML');
    expect(actionSystem('translate', { language: 'Spanish' })).toContain('into Spanish');
    expect(actionSystem('translate')).toContain('into English');
    expect(actionSystem('explain')).toMatch(/^You explain news stories/);
    expect(actionSystem('explain', { summaryOnly: true })).toContain(
      'You have only the summary the feed gives',
    );
    expect(actionSystem('summarize')).not.toContain('only the summary');
    expect(actionPrompt({ id: 's1', title: 'Title', text: 'Body' })).toBe(
      '<untrusted_story id="s1">\nTitle: Title\n\nBody\n</untrusted_story>',
    );
  });
});
