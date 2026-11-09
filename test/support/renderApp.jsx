import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onTestFinished } from 'vitest';
import App from '../../src/app/App.jsx';
import { createAppRouter } from '../../src/app/router.jsx';
import { makeStore } from '../../src/app/store.js';

/**
 * Opens the real app at `url`, the way a reader would. Rendering it again
 * after unmounting is a "reload": a fresh store and router, rebuilt from
 * whatever is in localStorage.
 *
 * @param {string} [url]
 */
export function renderApp(url = '/') {
  window.history.pushState(null, '', url);
  const store = makeStore();
  const router = createAppRouter();
  onTestFinished(() => router.dispose());

  const user = userEvent.setup();
  return { user, ...render(<App store={store} router={router} />) };
}
