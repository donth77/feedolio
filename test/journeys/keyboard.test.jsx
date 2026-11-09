import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { FEED_XML, STARTER_FEEDS } from '../fixtures/web.js';
import { server } from '../msw/server.js';
import { expectNoAxeViolations } from '../support/axe.js';
import { freezeTime } from '../support/clock.js';
import { renderApp } from '../support/renderApp.jsx';

freezeTime();

const FIRST = 'All the latest updates on AI data centers';
const SECOND = 'Shure’s popular podcasting and streaming mic is almost $50 off';
const PANDEMIC = 'Measuring the true toll of the pandemic';

/** Waits until every feed has loaded. */
async function storiesLoaded() {
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Loading stories' })).toBeNull());
}

describe('Keyboard shortcuts', () => {
  it('moves through stories with J and K, and opens one with Enter (US-87)', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();

    await user.keyboard('j');
    expect(screen.getByRole('link', { name: FIRST })).toHaveFocus();
    await user.keyboard('jj');
    await user.keyboard('k');
    expect(screen.getByRole('link', { name: SECOND })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: SECOND })).toBeVisible();
  });

  it('saves with S, opens the original with V, and opens with O', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { user } = renderApp('/');
    await storiesLoaded();

    await user.keyboard('j');
    await user.keyboard('s');
    expect(screen.getByRole('button', { name: `Save ${FIRST}` })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.keyboard('v');
    expect(open).toHaveBeenCalledWith(
      'https://www.theverge.com/ai-artificial-intelligence/902546/data-centers-ai-energy-power-grids-controversy',
      '_blank',
      'noopener,noreferrer',
    );

    await user.keyboard('o');
    expect(await screen.findByRole('heading', { level: 1, name: FIRST })).toBeVisible();
    open.mockRestore();
  });

  it('works on the story page too: S saves, J and K step through the feed, V opens the original', async () => {
    const { user } = renderApp('/feeds/f_v1lv882491');
    await user.click(await screen.findByRole('link', { name: PANDEMIC }));
    await screen.findByRole('heading', { level: 1, name: PANDEMIC });

    await user.keyboard('s');
    expect(screen.getByRole('button', { name: 'Save story' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.keyboard('j');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Why you sometimes need to break the rules in data viz',
      }),
    ).toBeVisible();
    await user.keyboard('k');
    expect(await screen.findByRole('heading', { level: 1, name: PANDEMIC })).toBeVisible();

    const original = screen.getByRole('link', { name: /^Read the original on medium\.com/ });
    const opened = vi.fn((/** @type {Event} */ event) => event.preventDefault());
    original.addEventListener('click', opened);
    await user.keyboard('v');
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('goes to sections with G then T, A or S', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();

    await user.keyboard('gt');
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await user.keyboard('gs');
    expect(await screen.findByRole('heading', { level: 1, name: 'Saved' })).toBeVisible();
    await user.keyboard('ga');
    expect(await screen.findByRole('heading', { level: 1, name: 'All stories' })).toBeVisible();
  });

  it('refreshes with R', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();

    server.use(
      http.get(
        STARTER_FEEDS.verge,
        () =>
          new HttpResponse(FEED_XML.rss1, { headers: { 'Content-Type': 'application/rss+xml' } }),
      ),
    );
    await user.keyboard('r');
    expect(await screen.findByRole('link', { name: 'First RDF story' })).toBeVisible();
  });

  it('lists every shortcut when the reader presses ? (US-88)', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();

    await user.keyboard('?');
    // The overlay's code loads the first time it opens.
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('Next or previous story')).toBeVisible();
    expect(within(dialog).getByText('Collapse or expand the sidebar')).toBeVisible();
    expect(within(dialog).getByText('Move the focused feed up or down')).toBeVisible();
    expect(within(dialog).getAllByRole('term')).toHaveLength(12);
    await expectNoAxeViolations(dialog);

    // Keys don't act on the page behind it.
    await user.keyboard('gs');
    expect(screen.getByRole('heading', { level: 1, name: 'All stories' })).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Close shortcuts' }));
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();

    // The header button opens it too.
    await user.click(screen.getByRole('button', { name: 'Shortcuts' }));
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  });

  it('stays out of the way while the reader types in a field', async () => {
    const { user } = renderApp('/settings');
    const field = await screen.findByRole('textbox', { name: 'Website or feed link' });

    await user.click(field);
    await user.keyboard('gs');

    expect(field).toHaveValue('gs');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  });
});

describe('Keyboard access', () => {
  it('returns focus to the story the reader came back from', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();

    await user.click(screen.getByRole('link', { name: SECOND }));
    await screen.findByRole('heading', { level: 1, name: SECOND });
    await user.click(screen.getByRole('link', { name: 'Back to All stories' }));

    await waitFor(() => expect(screen.getByRole('link', { name: SECOND })).toHaveFocus());
  });

  it('skips past the navigation to the content', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();

    await user.tab();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('skips to the story on a story page', async () => {
    const { user } = renderApp('/feeds/f_v1lv882491/stories/s_28qfi3oo2p0');
    await screen.findByRole('heading', { level: 1, name: PANDEMIC });

    await user.click(screen.getByRole('link', { name: 'Skip to story' }));
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
