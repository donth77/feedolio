import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router';
import { welcomeDismissed } from '../../app/visitsSlice.js';
import Icon from '../../components/Icon.jsx';
import { FeedDot } from '../../components/Monogram.jsx';
import { useOpenAddFeed } from '../subscriptions/addFeedContext.js';
import { selectAllSubscriptions } from '../subscriptions/subscriptionsSlice.js';
import { lookOf } from './useFeeds.js';
import styles from './WelcomeNote.module.css';

/**
 * Shown on a first visit, in place of the "New since your last visit"
 * divider: where the stories come from, and how to add more.
 */
export default function WelcomeNote() {
  const dispatch = useDispatch();
  const openAddFeed = useOpenAddFeed();
  const subscriptions = useSelector(selectAllSubscriptions);
  const starters = subscriptions.filter((subscription) => subscription.isDefault);

  return (
    <section aria-labelledby="welcome-heading" className={styles.welcome}>
      <div className={styles.intro}>
        <h2 id="welcome-heading" className={styles.title}>
          Welcome to Feedolio
        </h2>
        <p className={styles.lead}>
          {starters.length > 0
            ? `You’re following ${starters.length === 5 ? 'five' : starters.length} starter ${starters.length === 1 ? 'feed' : 'feeds'}. `
            : ''}
          Add your own by pasting any website or feed link.
        </p>
      </div>
      {starters.length > 0 && (
        <ul aria-label="Starter feeds" className={styles.starters}>
          {starters.map((subscription) => (
            <li key={subscription.id} className={styles.starter}>
              <FeedDot feed={lookOf(subscription)} />
              {subscription.title}
            </li>
          ))}
        </ul>
      )}
      <p className={styles.hint}>Save any story to keep it, even after it leaves its feed.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={openAddFeed}>
          <Icon name="add" size={18} />
          Add a feed
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => dispatch(welcomeDismissed())}
        >
          Dismiss
        </button>
        <Link to="/settings" className={styles.quiet}>
          Manage starter feeds
        </Link>
      </div>
    </section>
  );
}
