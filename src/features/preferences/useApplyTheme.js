import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { selectTheme } from './preferencesSlice.js';

/**
 * Puts the reader's theme on the page: `data-theme` on <html> for Light or
 * Dark; none for System, so tokens.css follows the operating system.
 */
export function useApplyTheme() {
  const theme = useSelector(selectTheme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.dataset.theme = theme;
  }, [theme]);
}
