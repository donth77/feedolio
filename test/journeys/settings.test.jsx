import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../support/axe.js';
import { freezeTime } from '../support/clock.js';
import { renderApp } from '../support/renderApp.jsx';

freezeTime();

/** The sidebar. */
function sidebar() {
  return screen.getByRole('navigation', { name: 'Sections and feeds' });
}

/** Waits until every feed has loaded. */
async function storiesLoaded() {
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Loading stories' })).toBeNull());
}

/** The titles in a Settings list, in order. @param {string} name */
function feedTitles(name) {
  const list = screen.queryByRole('list', { name });
  if (!list) return [];
  return within(list)
    .getAllByRole('listitem')
    .map((item) => /** @type {HTMLElement} */ (item.querySelector('span span, span')).textContent);
}

describe('Settings', () => {
  it('lists every feed, with suggested feeds and appearance (US-56)', async () => {
    renderApp('/settings');

    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    const yours = screen.getByRole('list', { name: 'Your feeds' });
    expect(within(yours).getAllByRole('switch')).toHaveLength(5);
    expect(
      within(yours).getByRole('switch', { name: 'Show in All stories BBC Technology' }),
    ).toBeChecked();
    expect(screen.getByText('You follow every starter feed.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Restore starter feeds' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    await expectNoAxeViolations();
  });

  it('hides a feed from All stories but keeps it in the sidebar (US-61)', async () => {
    const { user } = renderApp('/settings');

    await user.click(
      await screen.findByRole('switch', { name: 'Show in All stories BBC Technology' }),
    );
    expect(
      screen.getByRole('switch', { name: 'Show in All stories BBC Technology' }),
    ).not.toBeChecked();

    await user.click(within(sidebar()).getByRole('link', { name: 'All stories' }));
    await storiesLoaded();
    expect(screen.getByText('50 stories from 4 feeds')).toBeVisible();
    expect(
      screen.queryByRole('link', {
        name: 'AI stocks climb after trillions wiped from market values',
      }),
    ).toBeNull();

    // Still one click away.
    await user.click(within(sidebar()).getByRole('link', { name: 'BBC Technology' }));
    expect(
      await screen.findByRole('link', {
        name: 'AI stocks climb after trillions wiped from market values',
      }),
    ).toBeVisible();
  });

  it('removes a feed with Undo, and offers starter feeds back (US-62, US-94)', async () => {
    const { user } = renderApp('/settings');

    await user.click(await screen.findByRole('button', { name: 'Remove The Economist' }));
    expect(screen.getByText('Removed The Economist')).toBeVisible();
    expect(within(sidebar()).queryByRole('link', { name: 'The Economist' })).toBeNull();
    // Focus moves to the next feed's Remove button.
    expect(screen.getByRole('button', { name: 'Remove TechCrunch Startups' })).toHaveFocus();

    const suggested = screen.getByRole('list', { name: 'Suggested feeds' });
    expect(within(suggested).getByText('The Economist')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(within(sidebar()).getByRole('link', { name: 'The Economist' })).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Suggested feeds' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Remove The Economist' }));
    await user.click(screen.getByRole('button', { name: 'Add The Economist' }));
    expect(within(sidebar()).getByRole('link', { name: 'The Economist' })).toBeVisible();
  });

  it('restores the starter feeds (US-63)', async () => {
    const { user } = renderApp('/settings');

    await user.click(await screen.findByRole('button', { name: 'Remove Backchannel' }));
    await user.click(screen.getByRole('button', { name: 'Remove The Verge' }));
    await user.click(screen.getByRole('switch', { name: 'Show in All stories BBC Technology' }));
    expect(
      within(screen.getByRole('list', { name: 'Suggested feeds' })).getAllByRole('listitem'),
    ).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Restore starter feeds' }));

    expect(
      within(screen.getByRole('list', { name: 'Your feeds' })).getAllByRole('switch'),
    ).toHaveLength(5);
    expect(
      screen.getByRole('switch', { name: 'Show in All stories BBC Technology' }),
    ).toBeChecked();
    expect(screen.getByRole('button', { name: 'Restore starter feeds' })).toBeDisabled();
    expect(feedTitles('Suggested feeds')).toEqual([]);
  });

  it('switches the theme, and remembers it (US-65)', async () => {
    const first = renderApp('/settings');

    await first.user.click(await screen.findByRole('radio', { name: 'Dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    const second = first.reload();
    expect(await screen.findByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    await second.user.click(screen.getByRole('radio', { name: 'System' }));
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('sets the story text size and font', async () => {
    const { user } = renderApp('/settings');

    await user.click(await screen.findByRole('radio', { name: 'Large' }));
    await user.click(screen.getByRole('radio', { name: 'Sans' }));

    expect(screen.getByRole('radio', { name: 'Large' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Sans' })).toBeChecked();
  });
});
