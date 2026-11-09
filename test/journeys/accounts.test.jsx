import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION_KEY } from '../../src/features/auth/session.js';
import { signInHref } from '../../src/features/auth/useAuth.js';
import {
  approveOnGitHub,
  denyOnGitHub,
  GITHUB_APP,
  GITHUB_ENV,
  liveTokens,
} from '../fixtures/github.js';
import {
  callWorker,
  clearCookies,
  cookieNames,
  resetWorker,
  workerEnv,
  workerSettled,
} from '../msw/worker.js';
import { expectNoAxeViolations } from '../support/axe.js';
import { freezeTime } from '../support/clock.js';
import { renderApp } from '../support/renderApp.jsx';

freezeTime();

/** GitHub accounts. */
const ADA = {
  id: 101,
  login: 'ada',
  name: 'Ada Lovelace',
  avatarUrl: 'https://avatars.test/ada.png',
};
const GRACE = { id: 202, login: 'grace', name: 'Grace Hopper' };
const FIRST = 'All the latest updates on AI data centers';
const SECOND = 'Shure’s popular podcasting and streaming mic is almost $50 off';

beforeEach(() => {
  // This copy of Feedolio has a GitHub OAuth app.
  Object.assign(workerEnv, GITHUB_ENV);
});

/** The desktop sidebar. */
const sidebar = () => screen.getByRole('navigation', { name: 'Sections and feeds' });

/** Waits until every feed has loaded. */
async function storiesLoaded() {
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Loading stories' })).toBeNull());
}

/**
 * Follows "Sign in with GitHub" to the Worker; returns GitHub's page that the
 * Worker sends the reader to.
 *
 * @param {string} returnTo
 */
async function startSignIn(returnTo) {
  const response = await callWorker(
    new Request(new URL(signInHref(returnTo), window.location.origin)),
  );
  expect(response.status).toBe(302);
  return /** @type {string} */ (response.headers.get('Location'));
}

/**
 * GitHub sends the reader to the Worker's callback; returns where the Worker
 * then sends them in the app.
 *
 * @param {string} callbackUrl
 */
async function backFromGitHub(callbackUrl) {
  const response = await callWorker(new Request(callbackUrl));
  expect(response.status).toBe(302);
  return /** @type {string} */ (response.headers.get('Location'));
}

/**
 * Signs in on GitHub as `user` and comes back to `returnTo`.
 *
 * @param {ReturnType<typeof renderApp>} app
 * @param {typeof ADA} user
 * @param {string} [returnTo]
 */
async function returnSignedIn(app, user, returnTo = '/') {
  const landing = await backFromGitHub(approveOnGitHub(await startSignIn(returnTo), user));
  const next = app.visit(landing);
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
  it('isn’t needed: without GitHub settings everyone reads as a guest (US-73)', async () => {
    resetWorker();
    renderApp('/settings');

    expect(await screen.findByText(/^Sign-in isn’t set up on this copy of Feedolio/)).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Sign in with GitHub' })).toBeNull();
  });

  it('signs in with GitHub and comes back to the same page (US-74)', async () => {
    const first = renderApp('/today');
    await storiesLoaded();
    const link = await within(sidebar()).findByRole('link', { name: 'Sign in with GitHub' });
    expect(link).toHaveAttribute('href', '/api/auth/login?returnTo=%2Ftoday');

    // Off to GitHub: public profile only (no scope), PKCE, and GitHub's
    // account picker, so a shared browser never signs in the last reader.
    const authorize = new URL(await startSignIn('/today'));
    expect(`${authorize.origin}${authorize.pathname}`).toBe(
      'https://github.com/login/oauth/authorize',
    );
    expect(Object.fromEntries(authorize.searchParams)).toEqual({
      client_id: GITHUB_APP.clientId,
      redirect_uri: `${window.location.origin}/api/auth/callback`,
      state: expect.stringMatching(/^[\w-]{22}$/),
      code_challenge: expect.stringMatching(/^[\w-]{43}$/),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });

    const landing = await backFromGitHub(approveOnGitHub(authorize.href, ADA));
    expect(landing).toBe('/today?signin=ok');
    first.visit(landing);
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(
      await screen.findByText('Signed in as Ada Lovelace', { selector: '[role="status"] *' }),
    ).toBeVisible();
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(within(sidebar()).getByText('Ada Lovelace', { exact: false })).toBeVisible();

    // No GitHub token survives: GitHub revoked it, the sign-in cookies are
    // gone, and the browser holds only Feedolio's own data.
    await workerSettled();
    expect(liveTokens()).toEqual([]);
    expect(cookieNames()).toEqual([]);
    expect(Object.keys(localStorage).every((key) => key.startsWith('feedolio:'))).toBe(true);
    expect(JSON.stringify({ ...localStorage })).not.toMatch(/gho_|token/i);
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

    expect(within(sidebar()).getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('says so when the reader cancels at GitHub', async () => {
    const first = renderApp('/');
    const landing = await backFromGitHub(denyOnGitHub(await startSignIn('/')));
    expect(landing).toBe('/?signin=cancelled');
    first.visit(landing);

    expect(await screen.findByText('Sign-in was cancelled.')).toBeVisible();
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(
      await within(sidebar()).findByRole('link', { name: 'Sign in with GitHub' }),
    ).toBeVisible();
  });

  it('won’t finish a sign-in that started in another browser', async () => {
    const first = renderApp('/');
    // Someone else's sign-in, sent here as a link: this browser never started it.
    const theirs = approveOnGitHub(await startSignIn('/'), GRACE);
    clearCookies();
    const landing = await backFromGitHub(theirs);
    expect(landing).toBe('/?signin=failed');
    first.visit(landing);

    expect(await screen.findByText('Sign-in didn’t work. Try again in a moment.')).toBeVisible();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    // Their code was never even used.
    expect(liveTokens()).toEqual([]);
  });

  it('follows a sign-in made in another tab', async () => {
    renderApp('/');
    await storiesLoaded();

    const session = JSON.stringify({ id: 'github|202', name: GRACE.name, avatarUrl: null });
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
