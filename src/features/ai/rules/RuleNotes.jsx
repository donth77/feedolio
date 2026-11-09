import { useSelector } from 'react-redux';
import { Link } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import { updatedLabel } from '../../../lib/time.js';
import { selectRuleRun } from './judgmentsSlice.js';
import styles from './RuleNotes.module.css';
import { selectAllRules } from './rulesSlice.js';

/**
 * "3 stories hidden by your rules · View hidden", above a list.
 *
 * @param {{ hidden: number }} props
 */
export function HiddenNote({ hidden }) {
  if (hidden === 0) return null;
  return (
    <p className={styles.note}>
      <Icon name="hidden" size={18} className={styles.icon} />
      <span>
        {hidden} {hidden === 1 ? 'story' : 'stories'} hidden by your rules ·{' '}
        <Link to="/hidden">View hidden</Link>
      </span>
    </p>
  );
}

/**
 * Who checked the stories against the rules and when, or why they couldn't,
 * under All stories.
 *
 * @param {{ now: number }} props
 */
export function RulesStatus({ now }) {
  const rules = useSelector(selectAllRules);
  const run = useSelector(selectRuleRun);
  if (rules.length === 0) return null;
  const who = run.by === 'decision' ? 'Jev (decision model)' : 'your general model';
  return (
    <p className={`${styles.status} ${run.error ? styles.problem : ''}`}>
      <Icon name={run.error ? 'alert' : 'sparkle'} size={16} className={styles.icon} />
      <span>
        {run.error
          ? `Rules couldn’t check new stories. ${run.error}`
          : run.at
            ? `Rules checked by ${who} · ${updatedLabel(run.at, now)}`
            : 'Rules check new stories as they arrive.'}{' '}
        · <Link to="/settings/rules">Manage rules</Link>
      </span>
    </p>
  );
}
