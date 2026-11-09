import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { feedIdFor } from '../../src/lib/url.js';
import { EDGE_CASE_FEEDS, STARTER_FEEDS } from '../fixtures/web.js';
import { server } from '../msw/server.js';
import { expectNoAxeViolations } from '../support/axe.js';
import { freezeTime } from '../support/clock.js';
import { renderApp, seedSavedData } from '../support/renderApp.jsx';

freezeTime();

const ECONOMIST = `/feeds/${feedIdFor(STARTER_FEEDS.economist)}`;
const BACKCHANNEL = `/feeds/${feedIdFor(STARTER_FEEDS.backchannel)}`;
const PANDEMIC = 'Measuring the true toll of the pandemic';
const PANDEMIC_PAGE = `${ECONOMIST}/stories/s_28qfi3oo2p0`;
const PANDEMIC_LINK =
  'https://medium.com/the-economist/measuring-the-true-toll-of-the-pandemic-fa7e003b3ff4?source=rss----ae7c30c8cbcc---4';

/** Waits for the story page to show its story. @param {string} title */
async function storyShown(title) {
  return screen.findByRole('heading', { level: 1, name: title });
}

/** Links in the story that lead to other websites. */
function externalLinks() {
  return within(screen.getByRole('article'))
    .getAllByRole('link')
    .filter((link) => /^https?:/i.test(link.getAttribute('href') ?? ''));
}

describe('Opening a story', () => {
  it('shows everything its feed provides on the story’s own page (T-10)', async () => {
    const { user } = renderApp(ECONOMIST);

    await user.click(await screen.findByRole('link', { name: PANDEMIC }));

    expect(await storyShown(PANDEMIC)).toBeVisible();
    expect(window.location.pathname).toBe(PANDEMIC_PAGE);
    await waitFor(() => expect(document.title).toBe(`${PANDEMIC} · Feedolio`));

    // The source line links to the feed. (The story itself also links to The Economist.)
    expect(screen.getAllByRole('link', { name: 'The Economist' })[0]).toHaveAttribute(
      'href',
      ECONOMIST,
    );
    const topics = within(screen.getByRole('list', { name: 'Topics' })).getAllByRole('listitem');
    expect(topics.map((topic) => topic.textContent)).toEqual([
      'data-visualization',
      'coronavirus',
      'journalism',
      'covid19',
      'data-journalism',
    ]);
    const date = screen.getByText('Apr 24, 2020');
    expect(date).toHaveAttribute('datetime', '2020-04-24T17:05:41.000Z');
    expect(date.parentElement).toHaveTextContent(/^James Tozer · Apr 24, 2020 · 8 min read$/);

    // The body keeps its formatting and figures.
    expect(screen.getByText(/^One of the grim ironies of the covid-19 pandemic/)).toBeVisible();
    const figure = /** @type {HTMLImageElement} */ (
      document.querySelector(
        'article img[src="https://cdn-images-1.medium.com/max/731/0*wrwUoVP5A5rsmmdv"]',
      )
    );
    expect(figure).toHaveAttribute('loading', 'lazy');
    expect(figure).toHaveAttribute('referrerpolicy', 'no-referrer');

    // The main image came from the body, so it isn't repeated above it.
    expect(document.querySelectorAll('img[src*="0*wrwUoVP5A5rsmmdv"]')).toHaveLength(1);
    // Medium's tracking pixel is gone.
    expect(document.querySelector('img[src*="/_/stat"]')).toBeNull();

    for (const link of externalLinks()) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    const original = screen.getByRole('link', { name: /^Read the original on medium\.com/ });
    expect(original).toHaveAttribute('href', PANDEMIC_LINK);
    expect(original).toHaveAttribute('target', '_blank');

    await expectNoAxeViolations();
  });

  it('shows a summary-only story with a link to the full story (T-11)', async () => {
    const { user } = renderApp('/');

    await user.click(
      await screen.findByRole('link', {
        name: 'How a Blue Wave midterm might reshape the AI industry',
      }),
    );

    expect(await storyShown('How a Blue Wave midterm might reshape the AI industry')).toBeVisible();
    expect(screen.getByText(/^Democrats’ historic victories in this week’s/)).toBeVisible();
    expect(screen.getByRole('note')).toHaveTextContent(
      'TechCrunch Startups only shares a summary in its feed' +
        'That’s everything the feed provides. The full story is on techcrunch.com.',
    );
    const more = screen.getByRole('link', { name: /^Continue reading on techcrunch\.com/ });
    expect(more).toHaveAttribute(
      'href',
      'https://techcrunch.com/podcast/how-a-blue-wave-midterm-might-reshape-the-ai-industry/',
    );
    expect(more).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Today, 6:00 pm')).toBeVisible();

    // No reading time and no "Read the original": it isn't the full story.
    expect(screen.queryByText(/min read/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Read the original/ })).toBeNull();

    await expectNoAxeViolations();
  });

  it('shows a main image from outside the body above the story, at reading size', async () => {
    const { user } = renderApp('/');

    await user.click(
      await screen.findByRole('link', {
        name: 'AI stocks climb after trillions wiped from market values',
      }),
    );

    await storyShown('AI stocks climb after trillions wiped from market values');
    const hero = /** @type {HTMLImageElement} */ (
      screen.getByRole('article').querySelector('figure img')
    );
    expect(hero.src).toBe(
      'https://ichef.bbci.co.uk/ace/standard/1536/cpsprodpb/fdde/live/9036f7e0-da01-11f1-93e1-3b657b665bcf.jpg',
    );
    expect(hero).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.getByRole('link', { name: /^Continue reading on bbc\.co\.uk/ })).toBeVisible();
  });

  it('replaces embedded media with a link to the original', async () => {
    const { user } = renderApp(BACKCHANNEL);

    await user.click(
      await screen.findByRole('link', { name: 'The Future of Technology Is In Your Ear' }),
    );

    await storyShown('The Future of Technology Is In Your Ear');
    expect(document.querySelector('iframe')).toBeNull();
    const embed = screen.getByRole('link', {
      name: 'Embedded media Not shown here. View it on medium.com',
    });
    expect(embed.getAttribute('href')).toMatch(
      /^https:\/\/medium\.com\/backchannel\/the-future-of-technology-is-in-your-ear-/,
    );
    expect(embed).toHaveAttribute('target', '_blank');
  });

  it('can’t be used to run script from a hostile feed (T-12)', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    seedSavedData({
      subscriptions: [
        {
          id: feedIdFor(EDGE_CASE_FEEDS.hostile),
          url: EDGE_CASE_FEEDS.hostile,
          title: 'Hostile Feed',
          enabled: true,
          isDefault: false,
          addedAt: '2026-11-01T00:00:00.000Z',
        },
      ],
    });
    const { user } = renderApp('/');

    await user.click(await screen.findByRole('link', { name: 'Click me' }));
    await storyShown('Click me');

    const article = screen.getByRole('article');
    expect(document.querySelector('script')).toBeNull();
    expect(article.querySelector('iframe, object, embed, form, input, style')).toBeNull();
    expect(article.querySelector('svg:not([aria-hidden="true"])')).toBeNull();
    for (const element of document.body.querySelectorAll('*')) {
      for (const { name, value } of element.attributes) {
        expect(name, `<${element.localName} ${name}>`).not.toMatch(/^on/i);
        expect(name).not.toBe('style');
        expect(value, `<${element.localName} ${name}>`).not.toMatch(
          /^\s*(?:javascript|data|vbscript):/i,
        );
      }
    }

    // Unsafe links lose their address; safe ones open in a new tab.
    expect(screen.queryByRole('link', { name: 'evil link' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'data link' })).toBeNull();
    expect(screen.getByText('evil link')).toBeVisible();
    const good = screen.getByRole('link', { name: 'good link' });
    expect(good).toHaveAttribute('href', 'https://example.com/ok');
    expect(good).toHaveAttribute('target', '_blank');
    expect(good).toHaveAttribute('rel', 'noopener noreferrer');

    // The iframe, object and embed each became a link to the original.
    const embeds = screen.getAllByRole('link', { name: /^Embedded media/ });
    expect(embeds).toHaveLength(3);
    for (const embed of embeds) expect(embed).toHaveAttribute('href', 'https://hostile.test/');

    // The image keeps its picture but loses its handler; the data: image is gone.
    const images = article.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', 'https://hostile.test/x.png');
    expect(screen.getByText(/^Enough ordinary words follow/)).toBeVisible();

    expect(alert).not.toHaveBeenCalled();
  });
});

describe('Moving around', () => {
  it('goes back to the list it came from', async () => {
    const { user } = renderApp(ECONOMIST);

    await user.click(await screen.findByRole('link', { name: PANDEMIC }));
    await storyShown(PANDEMIC);
    await user.click(screen.getByRole('link', { name: 'Back to The Economist' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'The Economist' })).toBeVisible();
    expect(window.location.pathname).toBe(ECONOMIST);
  });

  it('steps through a feed with newer and older links, and Back still returns to the list', async () => {
    const { user } = renderApp(ECONOMIST);
    await user.click(await screen.findByRole('link', { name: PANDEMIC }));
    await storyShown(PANDEMIC);

    // The feed's newest story has nothing newer.
    const pager = screen.getByRole('navigation', { name: 'More from The Economist' });
    expect(within(pager).getAllByRole('link')).toHaveLength(1);
    await user.click(
      within(pager).getByRole('link', {
        name: 'Older in The Economist Why you sometimes need to break the rules in data viz',
      }),
    );

    const next = await storyShown('Why you sometimes need to break the rules in data viz');
    expect(next).toHaveFocus();
    expect(screen.getByRole('link', { name: `Newer in The Economist ${PANDEMIC}` })).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Older in The Economist Charting new territory' }),
    ).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'Back to The Economist' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'The Economist' })).toBeVisible();
  });

  it('links back to All stories when opened directly', async () => {
    const { user } = renderApp(PANDEMIC_PAGE);
    await storyShown(PANDEMIC);

    const back = screen.getByRole('link', { name: 'Back to All stories' });
    expect(back).toHaveAttribute('href', '/');
    await user.click(back);
    expect(await screen.findByRole('heading', { level: 1, name: 'All stories' })).toBeVisible();
  });
});

describe('Reloading', () => {
  it('keeps the story on screen, and the way back', async () => {
    const { user, reload } = renderApp(ECONOMIST);
    await user.click(await screen.findByRole('link', { name: PANDEMIC }));
    await storyShown(PANDEMIC);

    reload();

    expect(await storyShown(PANDEMIC)).toBeVisible();
    expect(window.location.pathname).toBe(PANDEMIC_PAGE);
    expect(screen.getByRole('link', { name: 'Back to The Economist' })).toBeVisible();
  });

  it('opens a saved story even when its feed is gone', async () => {
    seedSavedData({
      bookmarks: [
        {
          id: 's_kept',
          feedId: 'f_removed',
          feedTitle: 'Old Blog',
          savedAt: '2026-11-01T10:00:00.000Z',
          story: {
            id: 's_kept',
            feedId: 'f_removed',
            title: 'A story kept safe',
            link: 'https://old.test/kept',
            author: 'Ada Lovelace',
            publishedAt: '2026-10-30T09:00:00.000Z',
            categories: [],
            excerpt: 'The saved copy still opens.',
            contentHtml: '<p>The saved copy still opens.</p>',
            hasFullContent: false,
            imageUrl: null,
            imageSource: null,
          },
        },
      ],
    });
    renderApp('/feeds/f_removed/stories/s_kept');

    expect(await storyShown('A story kept safe')).toBeVisible();
    expect(screen.getByText('The saved copy still opens.')).toBeVisible();
    expect(screen.getByText('Old Blog')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Old Blog' })).toBeNull();
    expect(screen.getByRole('link', { name: /^Continue reading on old\.test/ })).toBeVisible();
  });
});

describe('Reading settings', () => {
  it('changes text size, font and line width, and remembers them', async () => {
    const first = renderApp(PANDEMIC_PAGE);
    await storyShown(PANDEMIC);

    const button = screen.getByRole('button', { name: 'Reading settings' });
    await first.user.click(button);
    const panel = screen.getByRole('dialog', { name: 'Reading settings' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(within(panel).getByRole('radio', { name: 'Medium' })).toBeChecked();
    expect(within(panel).getByRole('radio', { name: 'Medium' })).toHaveFocus();
    expect(within(panel).getByRole('radio', { name: 'Serif' })).toBeChecked();
    expect(within(panel).getByRole('radio', { name: 'Narrow' })).toBeChecked();
    expect(panel).toHaveTextContent('Saved on this device and used for every story.');
    await expectNoAxeViolations();

    await first.user.click(within(panel).getByRole('radio', { name: 'Extra large' }));
    await first.user.click(within(panel).getByRole('radio', { name: 'Sans serif' }));
    await first.user.click(within(panel).getByRole('radio', { name: 'Wide' }));
    await first.user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Reading settings' })).toBeNull();
    expect(button).toHaveFocus();

    const second = first.reload();
    await storyShown(PANDEMIC);
    await second.user.click(screen.getByRole('button', { name: 'Reading settings' }));
    const again = screen.getByRole('dialog', { name: 'Reading settings' });
    expect(within(again).getByRole('radio', { name: 'Extra large' })).toBeChecked();
    expect(within(again).getByRole('radio', { name: 'Sans serif' })).toBeChecked();
    expect(within(again).getByRole('radio', { name: 'Wide' })).toBeChecked();
  });

  it('closes when the reader clicks outside it', async () => {
    const { user } = renderApp(PANDEMIC_PAGE);
    await storyShown(PANDEMIC);

    await user.click(screen.getByRole('button', { name: 'Reading settings' }));
    expect(screen.getByRole('dialog', { name: 'Reading settings' })).toBeVisible();
    await user.click(screen.getByRole('heading', { level: 1 }));
    expect(screen.queryByRole('dialog', { name: 'Reading settings' })).toBeNull();
  });
});

describe('Stories that can’t be shown', () => {
  it('explains when a story has left its feed', async () => {
    renderApp(`${ECONOMIST}/stories/s_gone`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'This story isn’t available' }),
    ).toBeVisible();
    expect(screen.getByText(/^It’s no longer in The Economist’s feed\./)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to The Economist' })).toHaveAttribute(
      'href',
      ECONOMIST,
    );
    expect(screen.getByRole('link', { name: /^Visit medium\.com/ })).toHaveAttribute(
      'target',
      '_blank',
    );
    await waitFor(() => expect(document.title).toBe('Story not available · Feedolio'));
    await expectNoAxeViolations();
  });

  it('explains when the reader doesn’t follow the story’s feed', async () => {
    renderApp('/feeds/f_unknown/stories/s_unknown');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'This story isn’t available' }),
    ).toBeVisible();
    expect(
      screen.getByText('It came from a feed you don’t follow, and it isn’t in your saved stories.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'All stories' })).toHaveAttribute('href', '/');
  });

  it('offers Retry when the feed doesn’t load', async () => {
    server.use(
      http.get(
        STARTER_FEEDS.economist,
        () =>
          new HttpResponse('<h1>Not found</h1>', {
            status: 404,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );
    const { user } = renderApp(PANDEMIC_PAGE);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Couldn’t load this story' }),
    ).toBeVisible();
    expect(screen.getByText(/^The Economist didn’t load\./)).toBeVisible();

    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await storyShown(PANDEMIC)).toBeVisible();
  });

  it('shows a loading state while the feed loads', async () => {
    renderApp(PANDEMIC_PAGE);

    // It can be brief, so only its appearance is checked.
    await screen.findByText('Loading story…');
    await storyShown(PANDEMIC);
    await waitFor(() => expect(screen.queryByText('Loading story…')).toBeNull());
  });
});

describe('Links in a story', () => {
  it('open other sites in a new tab, without telling them where the reader came from', async () => {
    renderApp(PANDEMIC_PAGE);
    await storyShown(PANDEMIC);

    const links = externalLinks();
    expect(links.length).toBeGreaterThan(1);
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^(?:https?:|mailto:)/);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });
});
