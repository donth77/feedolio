import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from '../../src/app/persistence.js';
import { feedIdFor } from '../../src/lib/url.js';
import { FEED_XML, STARTER_FEEDS } from '../fixtures/web.js';
import { server } from '../msw/server.js';
import { expectNoAxeViolations } from '../support/axe.js';
import { freezeTime } from '../support/clock.js';
import { renderApp, seedSavedData } from '../support/renderApp.jsx';

freezeTime();

afterEach(() => {
  vi.restoreAllMocks();
});

const VERGE_ID = feedIdFor(STARTER_FEEDS.verge);
const DATA_CENTERS = 'All the latest updates on AI data centers';

/**
 * A saved copy of a story, as the app stores it.
 *
 * @param {{ id: string, title: string, savedAt: string, feedId?: string, feedTitle?: string }} story
 */
function bookmark({ id, title, savedAt, feedId = VERGE_ID, feedTitle = 'The Verge' }) {
  return {
    id,
    feedId,
    feedTitle,
    savedAt,
    story: {
      id,
      feedId,
      title,
      link: `https://saved.test/${id}`,
      author: 'A. Writer',
      publishedAt: '2026-10-30T09:00:00.000Z',
      categories: [],
      excerpt: `${title}, in short.`,
      contentHtml: `<p>${title}, in full.</p>`,
      hasFullContent: false,
      imageUrl: null,
      imageSource: null,
    },
  };
}

/** Waits until every feed has loaded. */
async function storiesLoaded() {
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Loading stories' })).toBeNull());
}

/** The sidebar's link to Saved, which carries the count. */
function savedLink() {
  return within(screen.getByRole('navigation', { name: 'Sections and feeds' })).getByRole('link', {
    name: /^Saved, /,
  });
}

/** Headlines on the Saved page, in order. */
function savedTitles() {
  return within(screen.getByRole('list', { name: 'Saved stories' }))
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);
}

describe('Saving stories', () => {
  it('saves from the list, and the bookmark survives a reload (T-13)', async () => {
    const first = renderApp('/');
    await storiesLoaded();

    const save = screen.getByRole('button', { name: `Save ${DATA_CENTERS}` });
    expect(save).toHaveAttribute('aria-pressed', 'false');
    await first.user.click(save);
    expect(save).toHaveAttribute('aria-pressed', 'true');
    expect(save).toHaveTextContent('Saved');
    expect(savedLink()).toHaveAccessibleName('Saved, 1 saved');

    first.reload();
    await storiesLoaded();
    expect(screen.getByRole('button', { name: `Save ${DATA_CENTERS}` })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await first.user.click(savedLink());
    expect(await screen.findByRole('heading', { level: 1, name: 'Saved' })).toBeVisible();
    expect(
      screen.getByText('1 story saved on this device · most recently saved first'),
    ).toBeVisible();
    expect(savedTitles()).toEqual([DATA_CENTERS]);
    expect(screen.getByText('Saved today')).toBeVisible();
    await expectNoAxeViolations();
  });

  it('saves from the story page', async () => {
    const { user } = renderApp(`/feeds/${VERGE_ID}`);
    await user.click(await screen.findByRole('link', { name: DATA_CENTERS }));
    await screen.findByRole('heading', { level: 1, name: DATA_CENTERS });

    const save = screen.getByRole('button', { name: 'Save story' });
    expect(save).toHaveAttribute('aria-pressed', 'false');
    expect(save).toHaveTextContent('Save');
    await user.click(save);
    expect(save).toHaveAttribute('aria-pressed', 'true');
    expect(save).toHaveTextContent('Saved');

    await user.click(screen.getByRole('link', { name: 'Back to The Verge' }));
    expect(await screen.findByRole('button', { name: `Save ${DATA_CENTERS}` })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('un-saves with the same button, and Undo puts the story back', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();
    const save = screen.getByRole('button', { name: `Save ${DATA_CENTERS}` });
    await user.click(save);

    await user.click(save);
    expect(save).toHaveAttribute('aria-pressed', 'false');
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Removed from Saved');

    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(save).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('status')).queryByText('Removed from Saved')).toBeNull();
  });
});

describe('The Saved page', () => {
  it('explains how to save when there’s nothing saved yet', async () => {
    const { user } = renderApp('/bookmarks');

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Nothing saved yet' }),
    ).toBeVisible();
    expect(screen.getByText(/^Use the bookmark on any story to keep it here\./)).toBeVisible();
    await expectNoAxeViolations();

    await user.click(screen.getByRole('link', { name: 'Browse all stories' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'All stories' })).toBeVisible();
  });

  it('lists the most recently saved first, and Undo restores a story where it was (T-18)', async () => {
    seedSavedData({
      bookmarks: [
        bookmark({ id: 's_older', title: 'Saved first', savedAt: '2026-11-01T10:00:00.000Z' }),
        bookmark({ id: 's_newer', title: 'Saved second', savedAt: '2026-11-05T10:00:00.000Z' }),
      ],
    });
    const { user } = renderApp('/bookmarks');

    await screen.findByRole('list', { name: 'Saved stories' });
    expect(savedTitles()).toEqual(['Saved second', 'Saved first']);
    expect(screen.getByText('Saved yesterday')).toBeVisible();
    expect(screen.getByText('Saved 5 days ago')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Remove from saved: Saved first' }));
    expect(savedTitles()).toEqual(['Saved second']);
    // Focus moves to the next row's button rather than being lost.
    expect(screen.getByRole('button', { name: 'Remove from saved: Saved second' })).toHaveFocus();

    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }));
    expect(savedTitles()).toEqual(['Saved second', 'Saved first']);
    expect(screen.getByText('Saved 5 days ago')).toBeVisible();
  });

  it('moves focus to “Browse all stories” after removing the last story', async () => {
    seedSavedData({
      bookmarks: [
        bookmark({ id: 's_only', title: 'The only one', savedAt: '2026-11-06T10:00:00.000Z' }),
      ],
    });
    const { user } = renderApp('/bookmarks');

    await user.click(
      await screen.findByRole('button', { name: 'Remove from saved: The only one' }),
    );
    expect(screen.getByRole('link', { name: 'Browse all stories' })).toHaveFocus();
  });

  it('keeps a story readable after it leaves its feed (T-14)', async () => {
    const first = renderApp(`/feeds/${VERGE_ID}`);
    await first.user.click(await screen.findByRole('button', { name: `Save ${DATA_CENTERS}` }));

    // The Verge publishes again, and the story drops out of its feed.
    server.use(
      http.get(
        STARTER_FEEDS.verge,
        () =>
          new HttpResponse(FEED_XML.empty, { headers: { 'Content-Type': 'application/rss+xml' } }),
      ),
    );
    const second = first.reload();
    await second.user.click(await screen.findByRole('link', { name: 'Saved, 1 saved' }));
    await second.user.click(await screen.findByRole('link', { name: DATA_CENTERS }));

    expect(await screen.findByRole('heading', { level: 1, name: DATA_CENTERS })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to Saved' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save story' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('link', { name: /^Read the original on theverge\.com/ })).toBeVisible();
  });

  it('keeps stories from a feed the reader no longer follows', async () => {
    seedSavedData({
      bookmarks: [
        bookmark({
          id: 's_gone',
          title: 'From a removed feed',
          savedAt: '2026-11-02T10:00:00.000Z',
          feedId: 'f_removed',
          feedTitle: 'Old Blog',
        }),
      ],
    });
    const { user } = renderApp('/bookmarks');

    const row = (await screen.findByRole('link', { name: 'From a removed feed' })).closest('li');
    expect(row).toHaveTextContent('Old Blog');
    await user.click(screen.getByRole('link', { name: 'From a removed feed' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'From a removed feed' }),
    ).toBeVisible();
    expect(screen.getByText('From a removed feed, in full.')).toBeVisible();
  });
});

describe('Other tabs', () => {
  it('shows a bookmark made in another tab without a reload (T-15)', async () => {
    renderApp('/');
    await storiesLoaded();
    const save = screen.getByRole('button', { name: `Save ${DATA_CENTERS}` });
    expect(save).toHaveAttribute('aria-pressed', 'false');

    // Another tab saves the story; this tab hears about it through a storage event.
    const fromOtherTab = (/** @type {object[]} */ bookmarks) => {
      const value = JSON.stringify({ version: 1, bookmarks });
      localStorage.setItem(STORAGE_KEY, value);
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: value,
          storageArea: localStorage,
        }),
      );
    };
    fromOtherTab([
      bookmark({ id: 's_1qzxau7a6he', title: DATA_CENTERS, savedAt: '2026-11-06T20:30:00.000Z' }),
    ]);

    await waitFor(() => expect(save).toHaveAttribute('aria-pressed', 'true'));
    expect(savedLink()).toHaveAccessibleName('Saved, 1 saved');

    fromOtherTab([]);
    await waitFor(() => expect(save).toHaveAttribute('aria-pressed', 'false'));
    expect(savedLink()).toHaveAccessibleName('Saved, 0 saved');
  });
});

describe('When the browser won’t save', () => {
  it('warns that storage is full, and keeps the bookmark for now', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    const { user } = renderApp('/');
    await storiesLoaded();

    const save = screen.getByRole('button', { name: `Save ${DATA_CENTERS}` });
    await user.click(save);

    expect(await screen.findByText(/^Storage is full/)).toBeVisible();
    expect(save).toHaveAttribute('aria-pressed', 'true');
  });

  it('says once that this browser won’t let Feedolio save', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError');
    });
    const { user } = renderApp('/');
    await storiesLoaded();

    await user.click(screen.getByRole('button', { name: `Save ${DATA_CENTERS}` }));
    const warning = await screen.findByText(/^This browser isn’t letting Feedolio save/);
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Dismiss' }));
    expect(warning).not.toBeInTheDocument();

    // A second failed save doesn't repeat the same warning.
    await user.click(
      screen.getByRole('button', {
        name: 'Save How a Blue Wave midterm might reshape the AI industry',
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(screen.queryByText(/^This browser isn’t letting Feedolio save/)).toBeNull();
  });
});
