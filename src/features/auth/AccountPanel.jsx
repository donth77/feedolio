import { useDispatch, useSelector, useStore } from 'react-redux';
import { Link } from 'react-router';
import { toastShown } from '../../app/toastSlice.js';
import Icon from '../../components/Icon.jsx';
import styles from './AccountPanel.module.css';
import { guestImportClosed, selectAuth } from './authSlice.js';
import { useSignInAvailable } from './signInStatus.js';
import { useAuthActions } from './useAuth.js';

/**
 * Sign in with GitHub, or who is signed in and Sign out.
 * - sidebar: a card at the foot of the sidebar
 * - rail: one icon in the collapsed sidebar
 * - settings: the Account section in Settings
 * Shows nothing (or, in Settings, a note) when sign-in isn't set up. Someone
 * already signed in can always sign out.
 *
 * @param {{ variant: 'sidebar'|'rail'|'settings' }} props
 */
export default function AccountPanel({ variant }) {
  const { user } = useSelector(selectAuth);
  const available = useSignInAvailable();
  const { signInHref, signOut } = useAuthActions();

  if (!user && available !== true) {
    return variant === 'settings' && available === false ? (
      <p className={styles.text}>
        Sign-in isn’t set up on this copy of Feedolio, so everything is saved for this browser.
      </p>
    ) : null;
  }

  // A link: the Worker takes the reader to GitHub and back.
  const signInButton = (
    <a
      href={signInHref}
      className={styles.button}
      aria-label={variant === 'rail' ? 'Sign in with GitHub' : undefined}
      title={variant === 'rail' ? 'Sign in with GitHub' : undefined}
    >
      <Icon name="signIn" size={18} />
      {variant !== 'rail' && 'Sign in with GitHub'}
    </a>
  );

  if (variant === 'rail') {
    return user ? (
      <Link
        to="/settings"
        className={styles.railAvatar}
        aria-label={`Account: signed in as ${user.name}`}
        title={`Signed in as ${user.name}`}
      >
        <Avatar user={user} />
      </Link>
    ) : (
      <div className={styles.rail}>{signInButton}</div>
    );
  }

  if (!user) {
    return (
      <div className={variant === 'sidebar' ? styles.card : styles.section}>
        <p className={styles.text}>
          {variant === 'sidebar'
            ? 'Saved stories stay in this browser. Sign in to keep yours separate from anyone else who uses it.'
            : 'Optional. Sign in with GitHub to keep your feeds and saved stories separate from anyone else who uses this browser. Everything stays on this device.'}
        </p>
        {signInButton}
      </div>
    );
  }

  return (
    <div className={variant === 'sidebar' ? styles.card : styles.section}>
      <div className={styles.who}>
        <Avatar user={user} />
        <p className={styles.name}>
          <span className={styles.label}>Signed in as</span> {user.name}
        </p>
      </div>
      {variant === 'settings' && (
        <p className={styles.text}>
          Your feeds and saved stories in this browser belong to this account. Signing out keeps
          them for next time.
        </p>
      )}
      <button type="button" className={styles.button} onClick={signOut}>
        <Icon name="signOut" size={18} />
        Sign out
      </button>
    </div>
  );
}

/**
 * The account's picture, or its initial when there isn't one.
 *
 * @param {{ user: import('./session.js').AccountUser }} props
 */
function Avatar({ user }) {
  return user.avatarUrl ? (
    <img
      className={styles.avatar}
      src={user.avatarUrl}
      alt=""
      width={28}
      height={28}
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className={styles.avatar} aria-hidden="true">
      {[...user.name][0]?.toUpperCase()}
    </span>
  );
}

/**
 * After a first sign-in on this device: offers to bring over the stories
 * saved here while signed out.
 */
export function GuestImportPrompt() {
  const { guestBookmarks } = useSelector(selectAuth);
  const dispatch = useDispatch();
  const store = /** @type {import('../../app/store.js').AppStore} */ (useStore());
  if (guestBookmarks === 0) return null;
  const stories = `${guestBookmarks} ${guestBookmarks === 1 ? 'story' : 'stories'}`;

  return (
    <section className={styles.prompt} aria-label="Saved stories from this browser">
      <p className={styles.promptTitle}>Bring your saved stories?</p>
      <p className={styles.text}>
        {stories} {guestBookmarks === 1 ? 'was' : 'were'} saved in this browser before you signed
        in. Add {guestBookmarks === 1 ? 'it' : 'them'} to your account?
      </p>
      <div className={styles.promptActions}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => {
            const count = store.importGuestBookmarks();
            dispatch(
              toastShown({
                message: `Added ${count} saved ${count === 1 ? 'story' : 'stories'} to your account`,
              }),
            );
          }}
        >
          Add {stories}
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => dispatch(guestImportClosed())}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
