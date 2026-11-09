import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router';

/**
 * The whole app: the Redux store around the router. Pending saves are written
 * as soon as the page is hidden or closed.
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
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flushWhenHidden);
    };
  }, [store]);

  return (
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
}
