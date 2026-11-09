import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../support/axe.js';
import { freezeTime } from '../support/clock.js';
import { renderApp } from '../support/renderApp.jsx';

freezeTime();

const STARTERS = [
  'Backchannel',
  'The Economist',
  'TechCrunch Startups',
  'BBC Technology',
  'The Verge',
];

/** The desktop sidebar. */
const sidebar = () => screen.getByRole('navigation', { name: 'Sections and feeds' });

/** The feeds a list shows, in order. @param {HTMLElement} container */
const feedsIn = (container) =>
  [...container.querySelectorAll('[data-reorder-label]')].map(
    (item) => /** @type {HTMLElement} */ (item).dataset.reorderLabel,
  );

/** What the reorder live region last said. */
async function announced(/** @type {string} */ text) {
  await waitFor(() => expect(document.getElementById('reorder-status')).toHaveTextContent(text));
}

describe('Reordering feeds', () => {
  it('moves feeds with Move up and Move down in Settings, and keeps the order', async () => {
    const first = renderApp('/settings');
    const list = await screen.findByRole('list', { name: 'Your feeds' });
    expect(feedsIn(list)).toEqual(STARTERS);
    // The ends say so without losing focus.
    expect(within(list).getByRole('button', { name: 'Move Backchannel up' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(list).getByRole('button', { name: 'Move The Verge down' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    const down = within(list).getByRole('button', { name: 'Move Backchannel down' });
    await first.user.click(down);
    expect(feedsIn(list)).toEqual([
      'The Economist',
      'Backchannel',
      'TechCrunch Startups',
      'BBC Technology',
      'The Verge',
    ]);
    // The button moved with its feed, and focus stayed on it.
    expect(within(list).getByRole('button', { name: 'Move Backchannel down' })).toHaveFocus();
    await announced('Backchannel moved to position 2 of 5.');

    const up = within(list).getByRole('button', { name: 'Move The Verge up' });
    await first.user.click(up);
    await first.user.click(within(list).getByRole('button', { name: 'Move The Verge up' }));
    const moved = [
      'The Economist',
      'Backchannel',
      'The Verge',
      'TechCrunch Startups',
      'BBC Technology',
    ];
    expect(feedsIn(list)).toEqual(moved);
    expect(within(list).getByRole('button', { name: 'Move The Verge up' })).toHaveFocus();
    // The sidebar and the phone chips follow.
    expect(feedsIn(sidebar())).toEqual(moved);
    const chips = screen.getByRole('navigation', { name: 'Stories to show' });
    expect(
      within(chips)
        .getAllByRole('link')
        .map((link) => link.textContent)
        .filter((name) => STARTERS.some((feed) => name?.endsWith(feed))),
    ).toEqual(moved.map((feed) => expect.stringContaining(feed)));

    // Already first: nothing moves, and it says so.
    await first.user.click(within(list).getByRole('button', { name: 'Move The Economist up' }));
    expect(feedsIn(list)).toEqual(moved);
    await announced('The Economist is already first.');
    await expectNoAxeViolations();

    // The order is kept.
    first.reload();
    expect(feedsIn(await screen.findByRole('list', { name: 'Your feeds' }))).toEqual(moved);
    expect(feedsIn(sidebar())).toEqual(moved);
  });

  it('moves the focused feed with Alt+↑ and Alt+↓ in the sidebar', async () => {
    const { user } = renderApp('/');
    const bbc = within(sidebar()).getByRole('link', { name: 'BBC Technology' });
    expect(bbc).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
    bbc.focus();

    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    await waitFor(() =>
      expect(feedsIn(sidebar())).toEqual([
        'Backchannel',
        'The Economist',
        'BBC Technology',
        'TechCrunch Startups',
        'The Verge',
      ]),
    );
    expect(within(sidebar()).getByRole('link', { name: 'BBC Technology' })).toHaveFocus();
    await announced('BBC Technology moved to position 3 of 5.');

    await user.keyboard('{Alt>}{ArrowDown}{ArrowDown}{/Alt}');
    await waitFor(() => expect(feedsIn(sidebar()).at(-1)).toBe('BBC Technology'));
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await announced('BBC Technology is already last.');
    expect(within(sidebar()).getByRole('link', { name: 'BBC Technology' })).toHaveFocus();
    // Moving isn't navigating.
    expect(window.location.pathname).toBe('/');
  });

  it('puts a removed feed back where it was on Undo', async () => {
    const { user } = renderApp('/settings');
    const list = await screen.findByRole('list', { name: 'Your feeds' });

    await user.click(within(list).getByRole('button', { name: 'Remove TechCrunch Startups' }));
    expect(feedsIn(list)).not.toContain('TechCrunch Startups');
    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(feedsIn(list)).toEqual(STARTERS);
    expect(feedsIn(sidebar())).toEqual(STARTERS);
  });
});
