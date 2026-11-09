import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../support/axe.js';
import { renderApp } from '../support/renderApp.jsx';

describe('Getting around', () => {
  it('opens on All stories and moves between the main sections', async () => {
    const { user } = renderApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'All stories' })).toBeVisible();
    expect(document.title).toBe('All stories · Feedolio');

    const sidebar = screen.getByRole('navigation', { name: 'Sections and feeds' });

    await user.click(within(sidebar).getByRole('link', { name: /^Today/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(window.location.pathname).toBe('/today');

    await user.click(within(sidebar).getByRole('link', { name: 'Saved' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Saved' })).toBeVisible();
    expect(window.location.pathname).toBe('/bookmarks');

    // Settings loads its code the first time it opens.
    await user.click(within(sidebar).getByRole('link', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    expect(within(sidebar).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(sidebar).getByRole('link', { name: 'All stories' })).not.toHaveAttribute(
      'aria-current',
    );
    await expectNoAxeViolations();

    await user.click(within(sidebar).getByRole('link', { name: 'Feedolio' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'All stories' })).toBeVisible();
    expect(window.location.pathname).toBe('/');
  });

  it('shows a friendly page for an address that doesn’t exist', async () => {
    const { user } = renderApp('/no-such-page');

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'Go to All stories' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'All stories' })).toBeVisible();
  });
});
