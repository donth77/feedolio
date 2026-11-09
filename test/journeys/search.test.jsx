import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { feedIdFor } from '../../src/lib/url.js';
import { seedAi } from '../fixtures/ai.js';
import { STARTER_FEEDS } from '../fixtures/web.js';
import { expectNoAxeViolations } from '../support/axe.js';
import { FEEDS_CAPTURED, freezeTime } from '../support/clock.js';
import { renderApp } from '../support/renderApp.jsx';

freezeTime();

const BBC_AI = 'AI stocks climb after trillions wiped from market values';
const TECHCRUNCH_AI = 'How a Blue Wave midterm might reshape the AI industry';
const VERGE_AI = 'All the latest updates on AI data centers';
const VERGE = feedIdFor(STARTER_FEEDS.verge);

/** The desktop sidebar. */
const sidebar = () => screen.getByRole('navigation', { name: 'Sections and feeds' });
const field = () => screen.getByRole('searchbox', { name: 'Search stories' });
const results = () => screen.findByRole('list', { name: 'Search results' }, { timeout: 8000 });
/** @param {HTMLElement} list */
const headlines = (list) =>
  within(list)
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);

/** Waits until every feed has loaded. */
async function storiesLoaded() {
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Loading stories' })).toBeNull());
}

describe('Search', () => {
  it('searches every feed and Saved, with the matching words highlighted (US-116, US-117, T-35)', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();
    await user.click(screen.getByRole('button', { name: `Save ${BBC_AI}` }));

    await user.click(within(sidebar()).getByRole('link', { name: 'Search' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
    expect(screen.getByText('Search your feeds and saved stories')).toBeVisible();
    expect(field()).toHaveFocus();

    await user.type(field(), 'AI');
    let list = await results();
    const everywhere = headlines(list);
    expect(everywhere).toEqual(expect.arrayContaining([BBC_AI, TECHCRUNCH_AI, VERGE_AI]));
    expect(screen.getByText(`${everywhere.length} stories match`)).toBeVisible();
    // Short words are whole words: nothing matches only through "said" or "Aina’s".
    for (const row of within(list).getAllByRole('listitem')) {
      // Line by line: the row's raw text runs the byline into the headline.
      const lines = [...row.querySelectorAll('p, h2')].map((line) => line.textContent);
      expect(lines.join('\n')).toMatch(/\bAI(s|'s|’s)?\b/i);
    }
    // The words themselves are marked, as text.
    const marked = within(list).getAllByRole('heading', { level: 2 })[0].querySelector('mark');
    expect(marked?.textContent).toBe('AI');
    expect(window.location.search).toBe('?q=AI');
    await expectNoAxeViolations();

    // Titles only.
    await user.click(screen.getByRole('radio', { name: 'Titles only' }));
    list = await results();
    const inTitles = headlines(list);
    expect(inTitles.length).toBeLessThanOrEqual(everywhere.length);
    for (const title of inTitles) expect(title).toMatch(/\bAI/i);
    expect(window.location.search).toBe('?q=AI&match=title');

    // Today: only stories from the last 24 hours.
    await user.click(screen.getByRole('radio', { name: 'Today' }));
    list = await results();
    const dayAgo = Date.parse(FEEDS_CAPTURED) - 86_400_000;
    for (const time of list.querySelectorAll('time')) {
      expect(Date.parse(/** @type {string} */ (time.getAttribute('datetime')))).toBeGreaterThan(
        dayAgo,
      );
    }

    // Saved: only the saved story.
    await user.click(screen.getByRole('radio', { name: 'Any time' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Search in' }), 'Saved');
    expect(headlines(await results())).toEqual([BBC_AI]);
  });

  it('matches every word, and phrases as written', async () => {
    const { user } = renderApp('/search');
    await user.type(
      await screen.findByRole('searchbox', { name: 'Search stories' }),
      'binance hack',
    );
    expect(headlines(await results()).sort()).toEqual([
      'Binance says fake job interviews used as part of $6.3bn crypto hack',
      'North Korea denies being behind record $6.3bn Binance hack',
    ]);

    await user.clear(field());
    await user.type(field(), '"founder summit"');
    const summit = headlines(await results());
    expect(summit.length).toBeGreaterThanOrEqual(3);
    for (const title of summit) expect(title).toMatch(/Founder Summit/);
  });

  it('starts within the feed you’re reading with /, clears with Esc, and comes back with Back (US-118, T-36)', async () => {
    const { user } = renderApp(`/feeds/${VERGE}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'The Verge' })).toBeVisible();
    await storiesLoaded();

    await user.keyboard('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Search in' })).toHaveValue(VERGE);
    expect(field()).toHaveFocus();

    await user.keyboard('AI');
    const list = await results();
    for (const row of within(list).getAllByRole('listitem')) {
      expect(row).toHaveTextContent(/^The Verge/);
    }

    // Open a result and come back to the same search, on the same story.
    const link = within(list).getByRole('link', { name: VERGE_AI });
    await user.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: VERGE_AI })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Back to Search' }));
    expect(await results()).toBeVisible();
    expect(field()).toHaveValue('AI');
    await waitFor(() => expect(screen.getByRole('link', { name: VERGE_AI })).toHaveFocus());

    // Esc clears the field; a second Esc leaves it.
    await user.click(field());
    await user.keyboard('{Escape}');
    expect(field()).toHaveValue('');
    expect(field()).toHaveFocus();
    expect(window.location.search).toBe(`?in=${VERGE}`);
    await user.keyboard('{Escape}');
    expect(field()).not.toHaveFocus();
  });

  it('says what search covers when nothing matches, and offers to widen it (US-119, T-37)', async () => {
    const { user } = renderApp(`/search?in=${VERGE}&q=zeppelin`);
    expect(
      await screen.findByRole(
        'heading',
        { level: 2, name: 'No stories match “zeppelin” in The Verge' },
        { timeout: 8000 },
      ),
    ).toBeVisible();
    expect(
      screen.getByText('Search covers the stories in your feeds now and everything you’ve saved.'),
    ).toBeVisible();
    await expectNoAxeViolations();

    await user.click(screen.getByRole('button', { name: 'Search all feeds' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'No stories match “zeppelin”' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Search all feeds' })).toBeNull();

    // The empty state's own Clear search (the field has one too).
    const empty = /** @type {HTMLElement} */ (
      screen.getByRole('heading', { level: 2, name: 'No stories match “zeppelin”' }).parentElement
    );
    await user.click(within(empty).getByRole('button', { name: 'Clear search' }));
    expect(field()).toHaveValue('');
    expect(field()).toHaveFocus();
    expect(screen.getByText('Search your feeds and saved stories')).toBeVisible();
  });

  it('is listed with the shortcuts, and the sidebar links the AI rules once AI is set up', async () => {
    const guest = renderApp('/');
    await storiesLoaded();
    expect(within(sidebar()).queryByRole('link', { name: 'Rules' })).toBeNull();
    await guest.user.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('Search (within the feed you’re in)')).toBeVisible();
    guest.unmount();

    seedAi({ general: 'anthropic' });
    renderApp('/');
    await storiesLoaded();
    expect(within(sidebar()).getByRole('link', { name: 'Rules' })).toHaveAttribute(
      'href',
      '/settings/rules',
    );
  });
});
