import '@testing-library/jest-dom/vitest';
import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import { closeCache } from '../../src/features/ai/cache.js';
import { removeAllKeys } from '../../src/features/ai/keys.js';
import { resetUsage } from '../../src/features/ai/usage.js';
import { takeOpenedStory } from '../../src/lib/returnFocus.js';
import { KEY_HOSTS } from '../fixtures/ai.js';
import { server } from '../msw/server.js';

// Views that load their code on first use (the story page, Settings) can take
// longer than the default second under coverage or a busy CI machine.
configure({ asyncUtilTimeout: 4000 });

// Match index.html, which jsdom never loads.
document.documentElement.lang = 'en';

// jsdom has no layout, so it can't scroll; React Router's scroll restoration calls this.
window.scrollTo = () => {};

// jsdom has no matchMedia. Tests run in a wide desktop window; only width queries match.
const TEST_WINDOW_WIDTH = 1440;
window.matchMedia ??= (query) => {
  const min = /min-width:\s*(\d+)px/.exec(query);
  const max = /max-width:\s*(\d+)px/.exec(query);
  const matches =
    Boolean(min || max) &&
    (!min || TEST_WINDOW_WIDTH >= Number(min[1])) &&
    (!max || TEST_WINDOW_WIDTH <= Number(max[1]));
  return /** @type {MediaQueryList} */ ({
    matches,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
};

// jsdom has <dialog> but not its methods; browsers add focus trapping on top.
HTMLDialogElement.prototype.showModal ??= function showModal() {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function close() {
  if (!this.open) return;
  this.open = false;
  this.dispatchEvent(new Event('close'));
};

// Any request without a handler fails the test, so nothing reaches the real internet.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

// No test may get an AI key sent anywhere but its own provider: not to
// /api/feed, not to another provider (§7.4, T-30). Every request is checked.
/** @type {string[]} */
const keyLeaks = [];
/** @type {Promise<void>[]} */
const checking = [];
server.events.on('request:start', ({ request }) => {
  checking.push(checkForKeys(request.clone()));
});

/** @param {Request} request */
async function checkForKeys(request) {
  const { host } = new URL(request.url);
  const headers = [...request.headers].map(([name, value]) => `${name}: ${value}`).join('\n');
  let body = '';
  try {
    body = await request.text();
  } catch {
    // No body to check.
  }
  for (const [key, allowed] of Object.entries(KEY_HOSTS)) {
    const where = [
      request.url.includes(key) && 'address',
      headers.includes(key) && 'headers',
      body.includes(key) && 'body',
    ].filter(Boolean);
    if (where.length && host !== allowed) {
      keyLeaks.push(`the ${allowed} key went to ${host}, in its ${where.join(' and ')}`);
    }
  }
}

afterEach(async () => {
  await Promise.all(checking.splice(0));
  expect(keyLeaks.splice(0), 'An AI key was sent somewhere other than its provider').toEqual([]);
});

afterEach(() => {
  cleanup();
  // The app remembers the last story opened from a list; each test starts fresh.
  takeOpenedStory();
  server.resetHandlers();
  localStorage.clear();
  sessionStorage.clear();
  removeAllKeys();
  resetUsage();
  window.history.replaceState(null, '', '/');
});

// jsdom has no IndexedDB; each test gets a fresh, empty one for the AI cache.
afterEach(async () => {
  await closeCache();
  globalThis.indexedDB = new IDBFactory();
});

afterAll(() => server.close());
