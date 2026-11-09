import { useCallback, useState } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import Toast from '../components/Toast.jsx';
import { useApplyTheme } from '../features/preferences/useApplyTheme.js';
import { ShortcutsContext } from '../features/shortcuts/shortcutsContext.js';
import ShortcutsDialog from '../features/shortcuts/ShortcutsDialog.jsx';
import { useShortcuts } from '../features/shortcuts/useShortcuts.js';

/**
 * Wraps every page: the list views inside the app shell, and the story page.
 * The toast and the keyboard shortcuts live here, so they work everywhere and
 * a message outlasts moving between pages.
 */
export default function RootLayout() {
  useApplyTheme();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const showShortcuts = useCallback(() => setShortcutsOpen(true), []);
  useShortcuts({ onShowHelp: showShortcuts });

  return (
    <ShortcutsContext.Provider value={showShortcuts}>
      <Outlet />
      <Toast />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ScrollRestoration />
    </ShortcutsContext.Provider>
  );
}
