import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { takeOpenedStory } from '../../src/lib/returnFocus.js';
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

afterEach(() => {
  cleanup();
  // The app remembers the last story opened from a list; each test starts fresh.
  takeOpenedStory();
  server.resetHandlers();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterAll(() => server.close());
