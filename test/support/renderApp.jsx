import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onTestFinished } from 'vitest';
import App from '../../src/app/App.jsx';
import { STORAGE_KEY } from '../../src/app/persistence.js';
import { createAppRouter } from '../../src/app/router.jsx';
import { makeStore } from '../../src/app/store.js';

/**
 * Opens the real app at `url`, the way a reader would.
 *
 * @param {string} [url]
 */
export function renderApp(url = '/') {
  window.history.pushState(null, '', url);
  return mount();
}

/**
 * Starts the app from whatever is in localStorage and the address bar: a fresh
 * store and router, like a page load.
 */
function mount() {
  const store = makeStore();
  const router = createAppRouter();
  // A save still waiting when the test ends must not land in the next test.
  onTestFinished(() => {
    store.stopSaving();
    router.dispose();
  });
  const user = userEvent.setup();
  const view = render(<App store={store} router={router} />);

  return {
    user,
    ...view,
    /**
     * Reloads the page. The browser fires pagehide (the app writes pending
     * saves), the page goes away, and the app starts again at the same address
     * and history entry.
     */
    reload() {
      window.dispatchEvent(new Event('pagehide'));
      view.unmount();
      store.stopSaving();
      router.dispose();
      return mount();
    },
  };
}

/**
 * Leaves what a previous visit would have saved, in the app's storage format.
 *
 * @param {{ subscriptions?: unknown[], bookmarks?: unknown[], preferences?: object, visits?: object }} data
 */
export function seedSavedData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...data }));
}
