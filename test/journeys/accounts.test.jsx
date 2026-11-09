import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAuthClient } from '../../src/features/auth/authClient.js';
import { SESSION_KEY } from '../../src/features/auth/session.js';
import { expectNoAxeViolations } from '../support/axe.js';
import { freezeTime } from '../support/clock.js';
import { renderApp } from '../support/renderApp.jsx';

freezeTime();

/**
 * Auth0's SDK, faked at its boundary: signing in "leaves" for GitHub, and the
 * test brings the reader back with ?code=…&state=….
 */
const auth0 = vi.hoisted(() => {
  const fake = {
    /** @type {Record<string, unknown>|null} */
    options: null,
    /** @type {{ sub: string, name: string, picture?: string }|null} */
    user: null,
    appState: { returnTo: '/' },
    /** @type {Error|null} */
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
  };
  class Auth0Client {
    /** @param {Record<string, unknown>} options */
    constructor(options) {
      fake.options = options;
    }
    /** @param {unknown} options */
    async loginWithRedirect(options) {
      fake.login(options);
    }
    async handleRedirectCallback() {
      if (fake.error) throw fake.error;
      return { appState: fake.appState };
    }
    async getUser() {
      return fake.user ?? undefined;
    }
    /** @param {unknown} options */
    async logout(options) {
      fake.logout(options);
    }
  }
  return { fake, Auth0Client };
});
vi.mock('@auth0/auth0-spa-js', () => ({ Auth0Client: auth0.Auth0Client }));

const ADA = { sub: 'github|101', name: 'Ada Lovelace', picture: 'https://avatars.test/ada.png' };
const GRACE = { sub: 'github|202', name: 'Grace Hopper' };
const FIRST = 'All the latest updates on AI data centers';
const SECOND = 'Shure’s popular podcasting and streaming mic is almost $50 off';

let visit = 0;

beforeEach(() => {
  vi.stubEnv('VITE_AUTH0_DOMAIN', 'feedolio-test.us.auth0.com');
  vi.stubEnv('VITE_AUTH0_CLIENT_ID', 'test-client-id');
  Object.assign(auth0.fake, {
    options: null,
    user: null,
    appState: { returnTo: '/' },
    error: null,
  });
  auth0.fake.login.mockClear();
  auth0.fake.logout.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetAuthClient();
});

/** The desktop sidebar. */
const sidebar = () => screen.getByRole('navigation', { name: 'Sections and feeds' });

/** Waits until every feed has loaded. */
async function storiesLoaded() {
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Loading stories' })).toBeNull());
}

/**
 * Comes back from GitHub signed in as `user`, on `returnTo`.
 *
 * @param {ReturnType<typeof renderApp>} app
 * @param {typeof ADA} user
 * @param {string} [returnTo]
 */
async function returnSignedIn(app, user, returnTo = '/') {
  auth0.fake.user = user;
  auth0.fake.appState = { returnTo };
  visit += 1;
  const next = app.visit(`/?code=code-${visit}&state=state-${visit}`);
  await waitFor(() =>
    expect(within(sidebar()).getByText(user.name, { exact: false })).toBeVisible(),
  );
  return next;
}

/** Titles on the Saved page. @param {ReturnType<typeof renderApp>} app */
async function savedTitles(app) {
  await app.user.click(within(sidebar()).getByRole('link', { name: /^Saved, / }));
  await screen.findByRole('heading', { level: 1, name: 'Saved' });
  const list = screen.queryByRole('list', { name: 'Saved stories' });
  return list
    ? within(list)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent)
    : [];
}

describe('Signing in', () => {
  it('isn’t needed: without Auth0 settings everyone reads as a guest (US-73)', async () => {
    vi.unstubAllEnvs();
    renderApp('/settings');

    expect(await screen.findByText(/^Sign-in isn’t set up on this copy of Feedolio/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sign in with GitHub' })).toBeNull();
  });

  it('signs in with GitHub and comes back to the same page (US-74)', async () => {
    const first = renderApp('/today');
    await storiesLoaded();

    await first.user.click(within(sidebar()).getByRole('button', { name: 'Sign in with GitHub' }));
    expect(auth0.fake.login).toHaveBeenCalledWith({
      authorizationParams: { connection: 'github' },
      appState: { returnTo: '/today' },
    });
    // Tokens stay in memory; Feedolio only keeps who signed in.
    expect(auth0.fake.options).toMatchObject({
      domain: 'feedolio-test.us.auth0.com',
      clientId: 'test-client-id',
      cacheLocation: 'memory',
    });

    await returnSignedIn(first, ADA, '/today');
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(window.location.search).toBe('');
    expect(
      screen.getByText('Signed in as Ada Lovelace', { selector: '[role="status"] *' }),
    ).toBeVisible();
    // Only Feedolio's own data is stored: no Auth0 tokens.
    expect(Object.keys(localStorage).every((key) => key.startsWith('feedolio:'))).toBe(true);
    expect(JSON.stringify({ ...localStorage })).not.toMatch(/token|auth0/i);
    await expectNoAxeViolations();
  });

  it('keeps each account’s saved stories apart, and offers guest stories once (US-75)', async () => {
    let app = renderApp('/');
    await storiesLoaded();
    await app.user.click(screen.getByRole('button', { name: `Save ${FIRST}` }));

    // Ada's first sign-in on this browser offers the guest's story.
    app = await returnSignedIn(app, ADA);
    const offer = await screen.findByRole('region', { name: 'Saved stories from this browser' });
    expect(offer).toHaveTextContent(
      '1 story was saved in this browser before you signed in. Add it to your account?',
    );
    await expectNoAxeViolations(offer);
    await app.user.click(within(offer).getByRole('button', { name: 'Add 1 story' }));
    expect(screen.queryByRole('region', { name: 'Saved stories from this browser' })).toBeNull();

    await storiesLoaded();
    await app.user.click(screen.getByRole('button', { name: `Save ${SECOND}` }));
    expect(await savedTitles(app)).toEqual([FIRST, SECOND]);

    // Signed out, the guest still has only their own story.
    await app.user.click(within(sidebar()).getByRole('button', { name: 'Sign out' }));
    expect(auth0.fake.logout).toHaveBeenCalledWith({
      logoutParams: { returnTo: window.location.origin },
    });
    expect(await savedTitles(app)).toEqual([FIRST]);

    // Grace is offered the guest's story too, and says not now.
    app = await returnSignedIn(app, GRACE);
    await app.user.click(
      within(
        await screen.findByRole('region', { name: 'Saved stories from this browser' }),
      ).getByRole('button', { name: 'Not now' }),
    );
    expect(await savedTitles(app)).toEqual([]);

    // Back to Ada: her two stories, and no second offer.
    await app.user.click(within(sidebar()).getByRole('button', { name: 'Sign out' }));
    app = await returnSignedIn(app, ADA);
    expect(screen.queryByRole('region', { name: 'Saved stories from this browser' })).toBeNull();
    expect(await savedTitles(app)).toEqual([FIRST, SECOND]);
  });

  it('stays signed in after a reload (US-74)', async () => {
    const first = renderApp('/');
    const second = await returnSignedIn(first, ADA);
    await storiesLoaded();
    await second.user.click(screen.getByRole('button', { name: `Save ${FIRST}` }));

    second.reload();
    await storiesLoaded();
    expect(within(sidebar()).getByText('Ada Lovelace', { exact: false })).toBeVisible();
    expect(screen.getByRole('button', { name: `Save ${FIRST}` })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('signs out, leaving the next reader the guest’s data (US-76)', async () => {
    const first = renderApp('/');
    const second = await returnSignedIn(first, ADA);
    await second.user.click(within(sidebar()).getByRole('button', { name: 'Sign out' }));

    expect(within(sidebar()).getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('says so when the reader cancels at GitHub', async () => {
    const first = renderApp('/');
    auth0.fake.error = new Error('access_denied');
    first.visit('/?error=access_denied&error_description=User%20cancelled&state=cancelled-1');

    expect(await screen.findByText('Sign-in was cancelled.')).toBeVisible();
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(within(sidebar()).getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
  });

  it('follows a sign-in made in another tab', async () => {
    renderApp('/');
    await storiesLoaded();

    const session = JSON.stringify({ id: GRACE.sub, name: GRACE.name, avatarUrl: null });
    localStorage.setItem(SESSION_KEY, session);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: SESSION_KEY,
        newValue: session,
        storageArea: localStorage,
      }),
    );

    await waitFor(() =>
      expect(within(sidebar()).getByText('Grace Hopper', { exact: false })).toBeVisible(),
    );
  });

  it('shows the account in Settings and in the sidebar rail', async () => {
    const first = renderApp('/');
    const second = await returnSignedIn(first, ADA, '/settings');

    const account = await screen.findByRole('region', { name: 'Account' });
    expect(account).toHaveTextContent('Signed in as Ada Lovelace');
    expect(within(account).getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expectNoAxeViolations();

    await second.user.click(within(sidebar()).getByRole('button', { name: 'Collapse sidebar' }));
    expect(
      within(sidebar()).getByRole('link', { name: 'Account: signed in as Ada Lovelace' }),
    ).toHaveAttribute('href', '/settings');
  });
});
