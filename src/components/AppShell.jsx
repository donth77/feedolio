import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router';
import styles from './AppShell.module.css';

const SECTIONS = [
  { to: '/', label: 'All stories', end: true },
  { to: '/today', label: 'Today' },
  { to: '/bookmarks', label: 'Saved' },
  { to: '/settings', label: 'Settings' },
];

/**
 * The frame around every view: the wordmark, the main sections and the
 * current view. M2 replaces this with the responsive shell (sidebar, drawer
 * and bottom tabs).
 */
export default function AppShell() {
  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <Link to="/" className={styles.wordmark}>
          Feedolio
        </Link>
        <nav aria-label="Main">
          <ul className={styles.navList}>
            {SECTIONS.map(({ to, label, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} className={styles.navLink}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className={styles.main}>
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  );
}
