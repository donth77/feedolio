import { Outlet, ScrollRestoration } from 'react-router';

/** Wraps every page: the list views inside the app shell, and the story page. */
export default function RootLayout() {
  return (
    <>
      <Outlet />
      <ScrollRestoration />
    </>
  );
}
