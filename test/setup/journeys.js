import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '../msw/server.js';

// Match index.html, which jsdom never loads.
document.documentElement.lang = 'en';

// jsdom has no layout, so it can't scroll; React Router's scroll restoration calls this.
window.scrollTo = () => {};

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
  server.resetHandlers();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterAll(() => server.close());
