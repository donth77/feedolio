import { Link } from 'react-router';
import { tagPath } from '../features/ai/rules/useRules.js';
import Icon from './Icon.jsx';
import styles from './RuleBadges.module.css';

/**
 * What the reader's rules say about a story in a list: highlighted, tagged,
 * or waiting in Maybe (US-105, US-107).
 *
 * @param {{ effects: import('../features/ai/rules/ruleEffects.js').StoryEffects | undefined }} props
 */
export default function RuleBadges({ effects }) {
  if (
    !effects ||
    (!effects.highlight && effects.tags.length === 0 && effects.maybes.length === 0)
  ) {
    return null;
  }
  return (
    <p className={styles.badges}>
      {effects.highlight && (
        <span className={styles.highlight}>
          <Icon name="sparkle" size={14} />
          Highlighted · {effects.highlight}
        </span>
      )}
      {effects.tags.map((tag) => (
        <Link key={tag} to={tagPath(tag)} className={styles.tag} aria-label={`Tag: ${tag}`}>
          {tag}
        </Link>
      ))}
      {effects.maybes.map((maybe) => (
        <Link key={maybe.ruleId} to="/maybe" className={styles.maybe}>
          Maybe · {maybe.tag ?? maybe.label}
        </Link>
      ))}
    </p>
  );
}
