import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { STORAGE_KEY } from '../../src/app/persistence.js';
import { FEED_XML, STARTER_FEEDS } from '../fixtures/web.js';
import { server } from '../msw/server.js';
import { expectNoAxeViolations } from '../support/axe.js';
import { FEEDS_CAPTURED, freezeTime } from '../support/clock.js';
import { renderApp, seedSavedData } from '../support/renderApp.jsx';

freezeTime();

/** Waits until every feed has loaded. */
async function storiesLoaded() {
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Loading stories' })).toBeNull());
}

/** Headline links in the order they appear. */
function headlines() {
  return within(screen.getByRole('main'))
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent);
}

describe('A first visit', () => {
  it('welcomes the reader instead of marking what’s new (US-93)', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();

    const welcome = screen.getByRole('region', { name: 'Welcome to Feedolio' });
    expect(welcome).toHaveTextContent(
      'You’re following five starter feeds. Add your own by pasting any website or feed link.',
    );
    expect(
      within(within(welcome).getByRole('list', { name: 'Starter feeds' })).getAllByRole('listitem'),
    ).toHaveLength(5);
    expect(screen.queryByRole('separator')).toBeNull();
    await expectNoAxeViolations();

    await user.click(within(welcome).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: 'Welcome to Feedolio' })).toBeNull();
  });

  it('records the visit when the reader leaves, so the next visit isn’t a first', async () => {
    const first = renderApp('/');
    await storiesLoaded();

    first.reload();
    await storiesLoaded();

    const saved = JSON.parse(/** @type {string} */ (localStorage.getItem(STORAGE_KEY)));
    expect(saved.visits.lastVisitAt).toBe(FEEDS_CAPTURED);
    expect(screen.queryByRole('region', { name: 'Welcome to Feedolio' })).toBeNull();
    // Nothing was published since, so there's no divider either.
    expect(screen.queryByRole('separator')).toBeNull();
  });
});

describe('A return visit', () => {
  it('puts a divider between new and older stories (US-84)', async () => {
    seedSavedData({ visits: { lastVisitAt: '2026-11-06T18:30:00.000Z' } });
    const { user } = renderApp('/');
    await storiesLoaded();

    expect(screen.getByText('5 new since your last visit')).toBeVisible();
    const divider = screen.getByRole('separator', {
      name: 'New since your last visit, Friday, November 6, 2026 at 6:30 PM. Newer stories are above.',
    });
    expect(divider).toHaveTextContent('New since your last visit · Today 6:30 pm');

    // The five new stories come before it, the rest after.
    const before = headlines().slice(0, 5);
    expect(before).toEqual([
      'All the latest updates on AI data centers',
      'Shure’s popular podcasting and streaming mic is almost $50 off',
      'AI stocks climb after trillions wiped from market values',
      'Lame-duck Congress might actually do something: speed up energy projects',
      'Why the US midterms sparked an AI stock selloff',
    ]);
    const firstOld = screen.getByRole('link', { name: /^Meta’s Muse AI can create custom/ });
    expect(
      divider.compareDocumentPosition(firstOld) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Welcome to Feedolio' })).toBeNull();
    await expectNoAxeViolations();

    await user.click(screen.getByRole('link', { name: 'Jump to where you left off' }));
    expect(firstOld).toHaveFocus();
  });

  it('marks what’s new on Today and on a feed’s page too', async () => {
    seedSavedData({ visits: { lastVisitAt: '2026-11-06T18:30:00.000Z' } });
    const { user } = renderApp('/today');
    await storiesLoaded();
    expect(screen.getByText('5 new since your last visit')).toBeVisible();
    expect(screen.getByRole('separator')).toBeVisible();

    await user.click(
      within(screen.getByRole('navigation', { name: 'Sections and feeds' })).getByRole('link', {
        name: 'The Verge',
      }),
    );
    expect(await screen.findByText('3 new since your last visit')).toBeVisible();
  });
});

describe('Refreshing', () => {
  it('fetches every feed again, and says how fresh the list is (US-13)', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();
    expect(screen.getByText('Updated just now')).toBeVisible();

    // The Verge publishes something else.
    server.use(
      http.get(
        STARTER_FEEDS.verge,
        () =>
          new HttpResponse(FEED_XML.rss1, { headers: { 'Content-Type': 'application/rss+xml' } }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByRole('link', { name: 'First RDF story' })).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
  });
});
