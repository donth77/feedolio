import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router';
import { STORAGE_KEY } from './persistence.js';

/**
 * The whole app: the Redux store around the router. Pending saves are written
 * as soon as the page is hidden or closed, and changes saved in other tabs
 * show up here at once.
 *
 * main.jsx and the journey tests each build their own store and router, so a
 * test "reload" is just rendering a fresh App.
 *
 * @param {{
 *   store: import('./store.js').AppStore,
 *   router: ReturnType<typeof import('./router.jsx').createAppRouter>,
 * }} props
 */
export default function App({ store, router }) {
  useEffect(() => {
    const flush = () => store.flushSaves();
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    // Fired only in the other tabs of this site when one of them saves.
    const takeOtherTabsChanges = (/** @type {StorageEvent} */ event) => {
      if (event.key === STORAGE_KEY || event.key === null) store.reloadSaved();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('storage', takeOtherTabsChanges);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('storage', takeOtherTabsChanges);
    };
  }, [store]);

  return (
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
}
