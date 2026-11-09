import { Link, useLocation } from 'react-router';
import Icon from '../../components/Icon.jsx';
import styles from './SettingsTabs.module.css';

/** Sections of the main Settings page, by the id of each section's heading. */
const SECTIONS = [
  { id: 'settings-feeds', label: 'Feeds' },
  { id: 'settings-appearance', label: 'Appearance' },
  { id: 'settings-account', label: 'Account' },
];

/**
 * Links between the parts of Settings: sections of the main page, and the
 * AI page. On the main page the links jump to a section and move focus to its
 * heading.
 */
export default function SettingsTabs() {
  const { pathname, hash } = useLocation();
  const onMain = pathname === '/settings';
  const currentSection = onMain ? hash.slice(1) || SECTIONS[0].id : null;

  return (
    <nav aria-label="Settings sections" className={styles.tabs}>
      {SECTIONS.map((section) => (
        <Link
          key={section.id}
          to={{ pathname: '/settings', hash: section.id }}
          className={styles.tab}
          aria-current={currentSection === section.id ? 'true' : undefined}
          onClick={() => {
            // The router scrolls to the section; focus follows for keyboard users.
            requestAnimationFrame(() =>
              document.getElementById(section.id)?.focus({ preventScroll: true }),
            );
          }}
        >
          {section.label}
        </Link>
      ))}
      <Link
        to="/settings/ai"
        className={styles.tab}
        aria-current={pathname === '/settings/ai' ? 'page' : undefined}
      >
        <Icon name="sparkle" size={16} />
        AI
      </Link>
    </nav>
  );
}
