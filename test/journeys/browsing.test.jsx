import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { STARTER_FEEDS } from '../fixtures/web.js';
import { server } from '../msw/server.js';
import { expectNoAxeViolations } from '../support/axe.js';
import { freezeTime } from '../support/clock.js';
import { renderApp } from '../support/renderApp.jsx';

freezeTime();

const TECHCRUNCH = '/feeds/f_ltff5e6vnx';
const BACKCHANNEL = '/feeds/f_192dt5nuhvi';
const VERGE = '/feeds/f_hjym44j85k';

/** The list item that holds a headline. @param {string|RegExp} title */
function rowOf(title) {
  return /** @type {HTMLElement} */ (screen.getByRole('link', { name: title }).closest('li'));
}

/** Waits until every feed has loaded. */
async function storiesLoaded() {
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Loading stories' })).toBeNull());
}

describe('All stories', () => {
  it('shows every starter feed’s headlines, newest first, under date headers', async () => {
    renderApp('/');

    // Grey placeholder rows hold the layout while feeds load.
    expect(screen.getByRole('list', { name: 'Loading stories' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await storiesLoaded();

    expect(screen.getByText('71 stories from 5 feeds')).toBeVisible();
    const headers = screen
      .getAllByRole('heading', { level: 2 })
      .filter((heading) => heading.closest('main'));
    expect(headers.map((heading) => heading.parentElement?.textContent)).toEqual([
      'TodayFriday, Nov 6 · 16 stories',
      'YesterdayThursday, Nov 5 · 6 stories',
      'Earlier this weekMon, Nov 2 to Wed, Nov 4 · 22 stories',
      'OlderBefore Nov 2 · 27 stories',
    ]);

    const headlines = within(screen.getByRole('main'))
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(headlines.slice(0, 3)).toEqual([
      'All the latest updates on AI data centers',
      'Shure’s popular podcasting and streaming mic is almost $50 off',
      'AI stocks climb after trillions wiped from market values',
    ]);
    expect(headlines).toHaveLength(71);

    await expectNoAxeViolations();
  });

  it('gives each headline its source, time, author and excerpt', async () => {
    renderApp('/');
    await storiesLoaded();

    const verge = rowOf('All the latest updates on AI data centers');
    expect(verge).toHaveTextContent('The Verge · 57 min ago · Verge Staff and Justine Calma');
    expect(verge).toHaveTextContent(/^.*Massive new data centers are the physical foundation/);
    expect(within(verge).getByText('57 min ago')).toHaveAttribute(
      'datetime',
      '2026-11-06T20:02:22.000Z',
    );

    expect(rowOf('How a Blue Wave midterm might reshape the AI industry')).toHaveTextContent(
      'TechCrunch Startups · 3h ago · Theresa Loconsolo and 3 others',
    );
    expect(rowOf('Harbinger raises $240M after expanding into defense')).toHaveTextContent(
      /TechCrunch Startups · 5:52 pm · Sean O.Kane/,
    );
    expect(rowOf('Measuring the true toll of the pandemic')).toHaveTextContent(
      'The Economist · Apr 24, 2020 · James Tozer',
    );
  });

  it('opens a story on its own page', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();

    await user.click(
      screen.getByRole('link', { name: 'All the latest updates on AI data centers' }),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Story' })).toBeVisible();
    expect(window.location.pathname).toMatch(new RegExp(`^${VERGE}/stories/s_[0-9a-z]+$`));
  });
});

describe('Main images', () => {
  it('loads story images lazily and without a referrer, and shows a monogram tile when there is none', async () => {
    renderApp('/');
    await storiesLoaded();

    const image = /** @type {HTMLImageElement} */ (
      rowOf('All the latest updates on AI data centers').querySelector('img')
    );
    // A list-sized copy, not the multi-megabyte original.
    expect(image.src).toBe(
      'https://platform.theverge.com/wp-content/uploads/sites/2/2026/04/STKS528_DATA_CENTERS_C.jpg?quality=90&strip=all&crop=0,0,100,100&w=256',
    );
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');

    const medium = /** @type {HTMLImageElement} */ (
      rowOf('Measuring the true toll of the pandemic').querySelector('img')
    );
    expect(medium.src).toBe('https://cdn-images-1.medium.com/max/256/0*wrwUoVP5A5rsmmdv');

    const techcrunch = rowOf('How a Blue Wave midterm might reshape the AI industry');
    expect(techcrunch.querySelector('img')).toBeNull();
    expect(within(techcrunch).getByText('TS')).toHaveAttribute('aria-hidden', 'true');
  });

  it('swaps a broken image for the monogram tile', async () => {
    renderApp('/');
    await storiesLoaded();

    const row = rowOf('All the latest updates on AI data centers');
    fireEvent.error(/** @type {HTMLImageElement} */ (row.querySelector('img')));
    expect(row.querySelector('img')).toBeNull();
    expect(within(row).getByText('V')).toBeVisible();
  });
});

describe('Today', () => {
  it('shows only stories from the last 24 hours', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();

    const sidebar = screen.getByRole('navigation', { name: 'Sections and feeds' });
    await user.click(within(sidebar).getByRole('link', { name: 'Today, 16 stories' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(screen.getByText('16 stories in the last 24 hours')).toBeVisible();
    const main = within(screen.getByRole('main'));
    expect(main.getAllByRole('heading', { level: 3 })).toHaveLength(16);
    expect(
      main.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Today']);
    // Yesterday 5:52 pm UTC is more than 24 hours before Friday 9 pm.
    expect(screen.queryByRole('link', { name: /Harbinger raises/ })).toBeNull();

    await expectNoAxeViolations();
  });
});

describe('One feed', () => {
  it('shows just that feed’s stories, with its address in the page and the URL', async () => {
    const { user } = renderApp('/');
    const sidebar = screen.getByRole('navigation', { name: 'Sections and feeds' });
    await user.click(within(sidebar).getByRole('link', { name: 'TechCrunch Startups' }));

    expect(window.location.pathname).toBe(TECHCRUNCH);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'TechCrunch Startups' }),
    ).toBeVisible();
    expect(screen.getByText('techcrunch.com/category/startups/feed')).toBeVisible();
    expect(within(sidebar).getByRole('link', { name: 'TechCrunch Startups' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await storiesLoaded();
    const rows = within(screen.getByRole('main')).getAllByRole('listitem');
    expect(rows).toHaveLength(20);
    for (const row of rows) {
      expect(row).toHaveTextContent(/TechCrunch Startups · /);
      expect(row.querySelector('img')).toBeNull();
    }

    await expectNoAxeViolations();
  });

  it('says when an archived feed last published', async () => {
    renderApp(BACKCHANNEL);
    expect(await screen.findByRole('note')).toHaveTextContent(
      'No new stories since Jan 3, 2018. Older stories stay readable.',
    );
  });

  it('explains when a feed isn’t one the reader follows', async () => {
    renderApp('/feeds/f_nothing');
    expect(await screen.findByRole('heading', { level: 1, name: 'Feed not found' })).toBeVisible();
  });
});

describe('Failures', () => {
  it('shows Retry for a feed that fails, while the others load (T-09)', async () => {
    server.use(
      http.get(STARTER_FEEDS.bbcTechnology, () => new HttpResponse('Gone', { status: 404 })),
    );
    const { user } = renderApp('/');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Couldn’t load BBC Technology. The site answered with an error (404).',
    );
    await storiesLoaded();
    expect(screen.getByText('50 stories from 4 feeds')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'All the latest updates on AI data centers' }),
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: /AI stocks climb/ })).toBeNull();

    server.resetHandlers();
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: /AI stocks climb/ })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('71 stories from 5 feeds')).toBeVisible();
  });

  it('tries again by itself when a publisher has a brief outage', async () => {
    server.use(
      http.get(STARTER_FEEDS.bbcTechnology, () => new HttpResponse(null, { status: 503 }), {
        once: true,
      }),
    );
    renderApp('/');

    expect(
      await screen.findByRole('link', { name: /AI stocks climb/ }, { timeout: 4000 }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Smaller screens', () => {
  it('opens the feed list in a drawer, which closes after picking a feed', async () => {
    const { user } = renderApp('/');

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const drawer = screen.getByRole('dialog', { name: 'Menu' });
    expect(drawer).toHaveAttribute('open');
    await expectNoAxeViolations(drawer);

    await user.click(within(drawer).getByRole('link', { name: 'The Verge' }));
    expect(window.location.pathname).toBe(VERGE);
    expect(drawer).not.toHaveAttribute('open');
  });

  it('switches what to show with chips, and sections with the bottom tabs', async () => {
    const { user } = renderApp('/');
    const chips = screen.getByRole('navigation', { name: 'Stories to show' });
    const tabs = screen.getByRole('navigation', { name: 'Main' });

    expect(within(chips).getByRole('link', { name: 'All' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await user.click(within(chips).getByRole('link', { name: 'Today' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(within(tabs).getByRole('link', { name: 'Stories' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(within(chips).getByRole('link', { name: 'BBC Technology' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'BBC Technology' })).toBeVisible();
    expect(within(tabs).getByRole('link', { name: 'Stories' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(within(tabs).getByRole('link', { name: 'Saved' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Saved' })).toBeVisible();
    expect(within(tabs).getByRole('link', { name: 'Stories' })).not.toHaveAttribute('aria-current');
  });
});
