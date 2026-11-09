import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { feedIdFor } from '../../src/lib/url.js';
import { changeDigestGroups, seedAi } from '../fixtures/ai.js';
import { STARTER_FEEDS } from '../fixtures/web.js';
import { server } from '../msw/server.js';
import { expectNoAxeViolations } from '../support/axe.js';
import { freezeTime } from '../support/clock.js';
import { renderApp } from '../support/renderApp.jsx';

freezeTime();

const BINANCE = 'Record $6.3bn Binance hack linked to North Korea';
const STOCKS = 'AI stocks swing after Democratic midterm wins';
const SUMMIT = 'TechCrunch Founder Summit 2026 in Boston';
const OPENED = 'AI stocks climb after trillions wiped from market values';

/** The digest's main stories, in order. */
const mainStories = () =>
  screen.findByRole('list', { name: 'Main stories, most important first' }, { timeout: 15000 });
/** @param {HTMLElement} list */
const headlines = (list) =>
  within(list)
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);

/** Requests to AI providers while a digest is built. */
function watchAi() {
  /** @type {string[]} */
  const seen = [];
  const listener = async ({ request }) => {
    const { host, pathname } = new URL(request.url);
    if (pathname.endsWith('/systemone')) seen.push(`${host} rank`);
    if (pathname === '/v1/messages') {
      const system = String((await request.clone().json()).system);
      seen.push(`${host} ${system.slice(0, 24)}`);
    }
  };
  server.events.on('request:start', listener);
  return seen;
}

describe('Catch me up', () => {
  it('groups unread stories into ranked main stories whose sources open in Feedolio (US-109 to US-111)', async () => {
    seedAi({ general: 'anthropic', decision: 'openrouter' });
    const requests = watchAi();
    const { user } = renderApp('/catch-up');

    expect(await screen.findByRole('heading', { level: 1, name: 'Catch me up' })).toBeVisible();
    await waitFor(() =>
      expect(screen.getByText('From the last week · 44 unread stories')).toBeVisible(),
    );
    // Nothing is sent until the reader asks.
    expect(requests).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Catch me up' }));
    expect(await screen.findByText(/^Grouping 44 stories into main stories/)).toBeVisible();

    const list = await mainStories();
    expect(headlines(list)).toEqual([
      BINANCE,
      STOCKS,
      'Cyber-attack hits European supermarket and blood storage freezers',
      'Hugging Face on open source AI economics',
      "Elon Musk: midterm spending and Cybertruck's end",
      "Apple's foldable iPhone Duo sales and app support",
      'Ebook platforms challenge Amazon Kindle ecosystem',
      SUMMIT,
    ]);
    const first = within(list).getAllByRole('listitem')[0];
    expect(within(first).getByText('High')).toBeVisible();
    expect(within(first).getByText('Importance 84 of 100')).toBeVisible();
    expect(first).toHaveTextContent(
      /Hackers stole a record \$6\.3bn in cryptocurrency from Binance/,
    );
    expect(within(first).getByRole('heading', { level: 3, name: 'Sources (2)' })).toBeVisible();
    expect(screen.getByText(/^Ranked by Jev/)).toHaveTextContent(
      'Ranked by Jev (decision model) · Summaries by claude-opus-5-5 · Generated just now',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Everything else (23)' })).toBeVisible();
    await expectNoAxeViolations();

    // One grouping, one ranking with Jev, and a summary per main story.
    expect(requests.filter((request) => request.includes('You build'))).toHaveLength(1);
    expect(requests.filter((request) => request === 'openrouter.ai rank')).toHaveLength(1);
    expect(requests.filter((request) => request.includes('You summarise one'))).toHaveLength(8);

    // Every source is a real story in Feedolio.
    const source = within(first).getAllByRole('listitem')[0];
    const link = within(source).getByRole('link');
    const title = link.textContent ?? '';
    expect(link.getAttribute('href')).toMatch(/^\/feeds\/f_[0-9a-z]+\/stories\/s_[0-9a-z]+$/);
    await user.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeVisible();

    // Coming back shows the same digest, without asking again.
    await user.click(screen.getByRole('link', { name: 'Back to Catch me up' }));
    expect(headlines(await mainStories())).toHaveLength(8);
    expect(requests.filter((request) => request.includes('You build'))).toHaveLength(1);
  }, 30000);

  it('drops story ids the model made up, and makes no links from its words (T-28)', async () => {
    seedAi({ general: 'anthropic', decision: 'openrouter' });
    changeDigestGroups((groups) => [
      {
        headline: 'Read more at https://evil.example/now',
        storyIds: ['s_made_up', ...groups[0].storyIds.slice(0, 1)],
      },
      { headline: 'A story nobody wrote', storyIds: ['s_also_made_up'] },
      ...groups.slice(1),
    ]);
    const { user } = renderApp('/catch-up');
    await user.click(await screen.findByRole('button', { name: 'Catch me up' }));

    const list = await mainStories();
    expect(headlines(list)).toContain('Read more at https://evil.example/now');
    expect(headlines(list)).not.toContain('A story nobody wrote');
    const card = within(list)
      .getByRole('heading', { level: 2, name: 'Read more at https://evil.example/now' })
      .closest('li');
    expect(
      within(/** @type {HTMLElement} */ (card)).getByRole('heading', { name: 'Sources (1)' }),
    ).toBeVisible();
    for (const anchor of document.querySelectorAll('a')) {
      expect(anchor.getAttribute('href') ?? '').not.toMatch(
        /evil\.example|s_made_up|s_also_made_up/,
      );
    }
  }, 30000);

  it('ranks with the general model when there’s no decision model', async () => {
    seedAi({ general: 'anthropic' });
    const requests = watchAi();
    const { user } = renderApp('/catch-up');
    await user.click(await screen.findByRole('button', { name: 'Catch me up' }));

    const list = await mainStories();
    expect(headlines(list).slice(0, 3)).toEqual([
      STOCKS,
      BINANCE,
      'Cyber-attack hits European supermarket and blood storage freezers',
    ]);
    expect(screen.getByText(/^Ranked by your general model/)).toBeVisible();
    expect(requests.filter((request) => request.includes('You rank the main'))).toHaveLength(1);
    expect(requests.filter((request) => request.endsWith('rank'))).toEqual([]);
  }, 30000);

  it('marks everything caught up, starting a new window, with Undo (US-112)', async () => {
    seedAi({ general: 'anthropic', decision: 'openrouter' });
    const { user, reload } = renderApp('/catch-up');
    await user.click(await screen.findByRole('button', { name: 'Catch me up' }));
    await mainStories();

    await user.click(screen.getByRole('button', { name: 'Mark all caught up' }));
    expect(await screen.findByRole('heading', { name: 'You’re all caught up' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to All stories' })).toHaveFocus();
    expect(screen.getByText('All caught up. The next digest starts from now.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(headlines(await mainStories())).toHaveLength(8);

    await user.click(screen.getByRole('button', { name: 'Mark all caught up' }));
    const app = reload();
    expect(await app.findByRole('heading', { name: 'You’re all caught up' })).toBeVisible();
    expect(app.getByText(/^Since your last catch-up on /)).toHaveTextContent(
      'Since your last catch-up on',
    );
  }, 30000);

  it('leaves out stories the reader has opened', async () => {
    seedAi({ general: 'anthropic', decision: 'openrouter' });
    const { user } = renderApp(`/feeds/${feedIdFor(STARTER_FEEDS.bbcTechnology)}`);
    await user.click(await screen.findByRole('link', { name: OPENED }));
    await screen.findByRole('heading', { level: 1, name: OPENED });
    await user.click(screen.getByRole('link', { name: /^Back to/ }));

    const sidebar = await screen.findByRole('navigation', { name: 'Sections and feeds' });
    await user.click(within(sidebar).getByRole('link', { name: 'Catch me up' }));
    await waitFor(() =>
      expect(screen.getByText('From the last week · 43 unread stories')).toBeVisible(),
    );
  });

  it('needs a general model, and says so', async () => {
    renderApp('/catch-up');
    expect(await screen.findByRole('heading', { name: 'Catch me up needs AI' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Settings › AI' })).toHaveAttribute(
      'href',
      '/settings/ai',
    );
  });
});
