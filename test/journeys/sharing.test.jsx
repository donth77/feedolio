import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../support/axe.js';
import { freezeTime } from '../support/clock.js';
import { renderApp } from '../support/renderApp.jsx';

freezeTime();

const PANDEMIC = 'Measuring the true toll of the pandemic';
const PANDEMIC_PAGE = '/feeds/f_v1lv882491/stories/s_28qfi3oo2p0';
const ORIGINAL =
  'https://medium.com/the-economist/measuring-the-true-toll-of-the-pandemic-fa7e003b3ff4?source=rss----ae7c30c8cbcc---4';

afterEach(() => {
  // Some tests give the browser a share sheet.
  delete (/** @type {any} */ (navigator).share);
});

/** Opens the pandemic story and returns its share section. */
async function openStory() {
  const view = renderApp(PANDEMIC_PAGE);
  await screen.findByRole('heading', { level: 1, name: PANDEMIC });
  return { ...view, share: screen.getByRole('region', { name: 'Share this story' }) };
}

describe('Sharing a story', () => {
  it('links to each network’s share page for the original story (US-49, US-50, US-54)', async () => {
    const { share } = await openStory();

    const link = (/** @type {RegExp} */ name) => within(share).getByRole('link', { name });
    expect(link(/^Post on X/)).toHaveAttribute(
      'href',
      `https://x.com/intent/post?text=Measuring+the+true+toll+of+the+pandemic&url=${encodeURIComponent(ORIGINAL)}`,
    );
    expect(link(/^Facebook/)).toHaveAttribute(
      'href',
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(ORIGINAL)}`,
    );
    expect(link(/^LinkedIn/)).toHaveAttribute(
      'href',
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(ORIGINAL)}`,
    );
    for (const network of [/^Post on X/, /^Facebook/, /^LinkedIn/]) {
      expect(link(network)).toHaveAttribute('target', '_blank');
      expect(link(network)).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(link(/^Email/)).toHaveAttribute(
      'href',
      `mailto:?subject=${encodeURIComponent(PANDEMIC)}&body=${encodeURIComponent(`${PANDEMIC}\n\n${ORIGINAL}`)}`,
    );

    // No network's buttons, scripts or frames are loaded (US-53).
    expect(document.querySelector('script, iframe')).toBeNull();
    await expectNoAxeViolations();
  });

  it('copies the link and says so (US-51)', async () => {
    const { user, share } = await openStory();

    await user.click(within(share).getByRole('button', { name: 'Copy link' }));

    expect(within(share).getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(within(share).getByRole('status')).toHaveTextContent('Link copied');
    expect(await navigator.clipboard.readText()).toBe(ORIGINAL);
  });

  it('opens the device’s share sheet where there is one (US-52)', async () => {
    const shareSheet = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: shareSheet, configurable: true });
    const { user } = await openStory();

    await user.click(screen.getByRole('button', { name: 'Share story' }));

    expect(shareSheet).toHaveBeenCalledWith({ title: PANDEMIC, url: ORIGINAL });
  });

  it('copies the link when there’s no share sheet (T-19)', async () => {
    const { user } = await openStory();

    await user.click(screen.getByRole('button', { name: 'Share story' }));

    expect(await screen.findByText('Copied the link to the story')).toBeVisible();
    expect(await navigator.clipboard.readText()).toBe(ORIGINAL);
  });
});
