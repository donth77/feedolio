import { Outlet, ScrollRestoration } from 'react-router';
import Toast from '../components/Toast.jsx';
import { useApplyTheme } from '../features/preferences/useApplyTheme.js';

/**
 * Wraps every page: the list views inside the app shell, and the story page.
 * The toast lives here so a message outlasts moving between pages.
 */
export default function RootLayout() {
  useApplyTheme();
  return (
    <>
      <Outlet />
      <Toast />
      <ScrollRestoration />
    </>
  );
}
