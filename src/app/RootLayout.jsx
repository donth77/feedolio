import { lazy, Suspense, useCallback, useState } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import Toast from '../components/Toast.jsx';
import { useFinishSignIn } from '../features/auth/useFinishSignIn.js';
import { useApplyTheme } from '../features/preferences/useApplyTheme.js';
import { ShortcutsContext } from '../features/shortcuts/shortcutsContext.js';
import { useShortcuts } from '../features/shortcuts/useShortcuts.js';

const ShortcutsDialog = lazy(() => import('../features/shortcuts/ShortcutsDialog.jsx'));

/**
 * Wraps every page: the list views inside the app shell, and the story page.
 * The toast and the keyboard shortcuts live here, so they work everywhere and
 * a message outlasts moving between pages.
 */
export default function RootLayout() {
  useApplyTheme();
  useFinishSignIn();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const showShortcuts = useCallback(() => setShortcutsOpen(true), []);
  useShortcuts({ onShowHelp: showShortcuts });

  return (
    <ShortcutsContext.Provider value={showShortcuts}>
      <Outlet />
      <Toast />
      {shortcutsOpen && (
        <Suspense fallback={null}>
          <ShortcutsDialog open onClose={() => setShortcutsOpen(false)} />
        </Suspense>
      )}
      <ScrollRestoration />
    </ShortcutsContext.Provider>
  );
}
