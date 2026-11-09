import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { starterSubscriptions } from '../../src/features/subscriptions/defaults.js';
import { feedIdFor } from '../../src/lib/url.js';
import { STARTER_FEEDS } from '../fixtures/web.js';
import { server } from '../msw/server.js';
import { expectNoAxeViolations } from '../support/axe.js';
import { freezeTime } from '../support/clock.js';
import { renderApp, seedSavedData } from '../support/renderApp.jsx';

freezeTime();

/** Waits until every feed has loaded. */
async function storiesLoaded() {
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Loading stories' })).toBeNull());
}

/** The sidebar. */
function sidebar() {
  return screen.getByRole('navigation', { name: 'Sections and feeds' });
}

/**
 * Opens the Add feed dialog from the sidebar.
 *
 * @param {import('@testing-library/user-event').UserEvent} user
 */
async function openAddFeed(user) {
  await user.click(within(sidebar()).getByRole('button', { name: 'Add feed' }));
  const dialog = screen.getByRole('dialog', { name: 'Add a feed' });
  // The form loads the first time the dialog opens.
  await within(dialog).findByRole('textbox', { name: 'Website or feed link' });
  return dialog;
}

/**
 * A small RSS feed, for sites the saved fixtures don't cover.
 *
 * @param {string} title
 * @param {string[]} headlines  Newest first
 */
function rssFeed(title, headlines) {
  const items = headlines
    .map(
      (headline, index) => `<item>
        <title>${headline}</title>
        <link>https://github.blog/${index}</link>
        <guid>${title}-${index}</guid>
        <pubDate>${new Date(Date.UTC(2026, 10, 5 - index, 10)).toUTCString()}</pubDate>
        <description>${headline}, in short.</description>
      </item>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel><title>${title}</title><link>https://github.blog/</link>
    <description>${title}</description>${items}</channel></rss>`;
}

describe('Adding a feed', () => {
  it('previews a pasted feed link, then follows it everywhere (US-57, US-58, US-92)', async () => {
    const first = renderApp('/');
    await storiesLoaded();
    const dialog = await openAddFeed(first.user);

    const field = within(dialog).getByRole('textbox', { name: 'Website or feed link' });
    expect(field).toHaveFocus();
    await first.user.type(field, 'classic.test/index.rdf{Enter}');

    const preview = await within(dialog).findByRole('region', {
      name: 'Preview of Classic RSS 1.0',
    });
    expect(within(preview).getByText('Found Classic RSS 1.0')).toBeVisible();
    expect(within(preview).getByText('classic.test · About 4 posts a week')).toBeVisible();
    expect(
      within(within(preview).getByRole('list'))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['First RDF storyWed 12:00 pm', 'Second RDF storyMon 12:00 pm']);
    await expectNoAxeViolations(dialog);

    await first.user.click(within(dialog).getByRole('button', { name: 'Add feed' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Classic RSS 1.0' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Add a feed' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Added Classic RSS 1.0');
    expect(screen.getByRole('link', { name: 'First RDF story' })).toBeVisible();
    expect(within(sidebar()).getByRole('link', { name: 'Classic RSS 1.0' })).toBeVisible();

    // It's in All stories now, and stays after a reload.
    const second = first.reload();
    await second.user.click(await within(sidebar()).findByRole('link', { name: 'All stories' }));
    await storiesLoaded();
    expect(screen.getByText('73 stories from 6 feeds')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Second RDF story' })).toBeVisible();
  });

  it('finds the feed from a website’s address (US-90)', async () => {
    seedSavedData({
      subscriptions: starterSubscriptions(Date.parse('2026-11-01T00:00:00Z')).filter(
        (subscription) => subscription.url !== STARTER_FEEDS.verge,
      ),
    });
    const { user } = renderApp('/');
    await storiesLoaded();
    const dialog = await openAddFeed(user);

    await user.type(within(dialog).getByRole('textbox'), 'theverge.com{Enter}');

    expect(await within(dialog).findByText('Found The Verge')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Add feed' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'The Verge' })).toBeVisible();
    expect(window.location.pathname).toBe(`/feeds/${feedIdFor(STARTER_FEEDS.verge)}`);
  });

  it('lets the reader choose when a page links to several feeds (US-91)', async () => {
    server.use(
      http.get(
        'https://github.blog/feed/',
        () =>
          new HttpResponse(rssFeed('The GitHub Blog', ['Posts one', 'Posts two']), {
            headers: { 'Content-Type': 'application/rss+xml' },
          }),
      ),
      http.get(
        'https://github.blog/comments/feed/',
        () =>
          new HttpResponse(rssFeed('Comments on The GitHub Blog', ['A comment']), {
            headers: { 'Content-Type': 'application/rss+xml' },
          }),
      ),
    );
    const { user } = renderApp('/');
    await storiesLoaded();
    const dialog = await openAddFeed(user);

    await user.type(within(dialog).getByRole('textbox'), 'https://github.blog{Enter}');

    const choices = await within(dialog).findByRole('group', {
      name: 'We found 2 feeds on this page. Choose one.',
    });
    const posts = within(choices).getByRole('radio', { name: /^The GitHub Blog » Feed/ });
    expect(posts).toBeChecked();
    expect(await within(dialog).findByText('Found The GitHub Blog')).toBeVisible();
    await expectNoAxeViolations(dialog);

    await user.click(
      within(choices).getByRole('radio', { name: /^The GitHub Blog » Comments Feed/ }),
    );
    expect(await within(dialog).findByText('Found Comments on The GitHub Blog')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Add feed' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Comments on The GitHub Blog' }),
    ).toBeVisible();
  });

  it('explains when a page has no feed, and adds nothing (T-16)', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();
    const dialog = await openAddFeed(user);
    const field = within(dialog).getByRole('textbox', { name: 'Website or feed link' });

    await user.type(field, 'example.com{Enter}');

    const problem = await within(dialog).findByRole('alert');
    expect(problem).toHaveTextContent(
      'We couldn’t find a feed at that address.' +
        'Try the site’s homepage, or a link that ends in /feed or /rss.',
    );
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(/We couldn’t find a feed at that address\./);
    expect(within(dialog).queryByRole('button', { name: 'Add feed' })).toBeNull();
    await expectNoAxeViolations(dialog);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Add a feed' })).toBeNull();
    expect(within(sidebar()).getAllByRole('link', { name: /./ })).toHaveLength(
      // Today, All stories, Saved, the wordmark, five feeds and Settings
      10,
    );
  });

  it('stops a feed the reader already follows, however it’s written (T-17, US-60)', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();
    const dialog = await openAddFeed(user);
    const field = within(dialog).getByRole('textbox');

    await user.type(field, 'https://WWW.theverge.com/rss/index.xml/{Enter}');
    expect(within(dialog).getByRole('status')).toHaveTextContent('You already follow The Verge.');
    expect(within(dialog).getByRole('link', { name: 'Open The Verge' })).toBeVisible();

    // A website address that leads to a followed feed is caught too.
    await user.clear(field);
    await user.type(field, 'theverge.com{Enter}');
    await waitFor(() =>
      expect(within(dialog).getByRole('status')).toHaveTextContent('You already follow The Verge.'),
    );
    expect(within(dialog).queryByRole('button', { name: 'Add feed' })).toBeNull();

    await user.click(within(dialog).getByRole('link', { name: 'Open The Verge' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'The Verge' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Add a feed' })).toBeNull();
  });

  it('checks the address before looking it up', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();
    const dialog = await openAddFeed(user);
    const field = within(dialog).getByRole('textbox');

    await user.click(within(dialog).getByRole('button', { name: 'Find feed' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Paste the address of a website or a feed.',
    );

    await user.type(field, 'not a link{Enter}');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'That doesn’t look like a web address.',
    );

    // Typing again clears the complaint.
    await user.type(field, 's');
    expect(within(dialog).queryByRole('alert')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Add a feed' })).toBeNull();
  });

  it('opens from the welcome note on a first visit', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();

    await user.click(screen.getByRole('button', { name: 'Add a feed' }));
    expect(screen.getByRole('dialog', { name: 'Add a feed' })).toBeVisible();
  });

  it('adds a feed from Settings too', async () => {
    const { user } = renderApp('/settings');
    const field = await screen.findByRole('textbox', { name: 'Website or feed link' });

    await user.type(field, 'classic.test/index.rdf{Enter}');
    const settings = screen.getByRole('main');
    await user.click(await within(settings).findByRole('button', { name: 'Add feed' }));

    expect(await screen.findByText('Added Classic RSS 1.0')).toBeVisible();
    const yours = screen.getByRole('list', { name: 'Your feeds' });
    expect(within(yours).getByText('Classic RSS 1.0')).toBeVisible();
    expect(field).toHaveValue('');
  });
});
