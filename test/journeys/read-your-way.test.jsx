import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../support/axe.js';
import { freezeTime } from '../support/clock.js';
import { renderApp } from '../support/renderApp.jsx';

freezeTime();

/** Waits until every feed has loaded. */
async function storiesLoaded() {
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Loading stories' })).toBeNull());
}

/** The desktop sidebar, expanded or as a rail. */
function sidebar() {
  return screen.getByRole('navigation', { name: 'Sections and feeds' });
}

describe('Layouts', () => {
  it('switches to Cards and back, and remembers the choice (US-85)', async () => {
    const first = renderApp('/');
    await storiesLoaded();
    const layout = screen.getByRole('group', { name: 'Layout' });
    expect(within(layout).getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await first.user.click(within(layout).getByRole('button', { name: 'Cards' }));
    expect(within(layout).getByRole('button', { name: 'Cards' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Cards label their Save button.
    expect(
      screen.getByRole('button', { name: 'Save All the latest updates on AI data centers' }),
    ).toHaveTextContent('Save');
    await expectNoAxeViolations();

    first.reload();
    await storiesLoaded();
    expect(
      within(screen.getByRole('group', { name: 'Layout' })).getByRole('button', { name: 'Cards' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches density from a menu, by mouse or keyboard, and remembers it (US-86)', async () => {
    const first = renderApp('/');
    await storiesLoaded();

    const button = screen.getByRole('button', { name: 'Density: Comfortable' });
    await first.user.click(button);
    const menu = screen.getByRole('menu', { name: 'Density' });
    expect(within(menu).getByRole('menuitemradio', { name: 'Comfortable' })).toHaveFocus();
    expect(within(menu).getByRole('menuitemradio', { name: 'Comfortable' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expectNoAxeViolations();

    await first.user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitemradio', { name: 'Compact' })).toHaveFocus();
    await first.user.keyboard('{Enter}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Density: Compact' })).toHaveFocus();

    // Esc closes without changing anything.
    await first.user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menu', { name: 'Density' })).toBeVisible();
    await first.user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();

    first.reload();
    await storiesLoaded();
    expect(screen.getByRole('button', { name: 'Density: Compact' })).toBeVisible();
  });

  it('can be set in Settings too', async () => {
    const { user } = renderApp('/settings');

    await user.click(await screen.findByRole('radio', { name: 'Cards' }));
    await user.click(screen.getByRole('radio', { name: 'Compact' }));
    await user.click(within(sidebar()).getByRole('link', { name: 'All stories' }));

    await storiesLoaded();
    expect(screen.getByRole('button', { name: 'Cards' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Density: Compact' })).toBeVisible();
  });
});

describe('The sidebar', () => {
  it('collapses to a rail with [ and the button, and remembers it (US-115)', async () => {
    const first = renderApp('/');
    await storiesLoaded();

    const collapse = within(sidebar()).getByRole('button', { name: 'Collapse sidebar' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    // "[[" types a single "[" in user-event's key syntax.
    await first.user.keyboard('[[');

    const rail = sidebar();
    const expand = within(rail).getByRole('button', { name: 'Expand sidebar' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    // Every icon keeps a name.
    expect(
      within(rail)
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual([
      'Feedolio',
      'Search',
      'Today, 16 stories',
      'All stories',
      'Saved, 0 saved',
      'Backchannel',
      'The Economist',
      'TechCrunch Startups',
      'BBC Technology',
      'The Verge',
      'Settings',
    ]);
    expect(within(rail).getByRole('button', { name: 'Add feed' })).toBeVisible();
    await expectNoAxeViolations();

    const second = first.reload();
    await storiesLoaded();
    expect(within(sidebar()).getByRole('button', { name: 'Expand sidebar' })).toBeVisible();

    await second.user.click(within(sidebar()).getByRole('button', { name: 'Expand sidebar' }));
    const collapseAgain = within(sidebar()).getByRole('button', { name: 'Collapse sidebar' });
    expect(collapseAgain).toHaveAttribute('aria-expanded', 'true');
    // The button is new, but focus stays on it.
    expect(collapseAgain).toHaveFocus();
    expect(within(sidebar()).getByRole('link', { name: 'Today, 16 stories' })).toHaveTextContent(
      'Today',
    );
  });

  it('opens a section from the rail', async () => {
    const { user } = renderApp('/');
    await storiesLoaded();
    await user.click(within(sidebar()).getByRole('button', { name: 'Collapse sidebar' }));

    await user.click(within(sidebar()).getByRole('link', { name: 'The Verge' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'The Verge' })).toBeVisible();
    expect(within(sidebar()).getByRole('link', { name: 'The Verge' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
