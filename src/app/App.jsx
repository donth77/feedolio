import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router';

/**
 * The whole app: the Redux store around the router.
 * main.jsx and the journey tests each build their own store and router, so a
 * test "reload" is just rendering a fresh App.
 *
 * @param {{
 *   store: import('./store.js').AppStore,
 *   router: ReturnType<typeof import('./router.jsx').createAppRouter>,
 * }} props
 */
export default function App({ store, router }) {
  return (
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
}
