import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { toastShown } from '../../app/toastSlice.js';
import Icon from '../../components/Icon.jsx';
import { copyText, shareLinks } from './shareLinks.js';
import styles from './ShareBar.module.css';

/** How long "Copied" shows on the button. */
const COPIED_MS = 2_500;

/**
 * "Share this story": X, Facebook, LinkedIn, email and Copy link, all for the
 * publisher's original page.
 *
 * @param {{ title: string, url: string }} props  url: the publisher's page
 */
export default function ShareBar({ title, url }) {
  const links = shareLinks({ title, url });
  const [copied, setCopied] = useState(false);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <section className={styles.bar} aria-labelledby="share-heading">
      <h2 id="share-heading" className={styles.heading}>
        Share this story
      </h2>
      <div className={styles.buttons}>
        <ShareLink href={links.x}>Post on X</ShareLink>
        <ShareLink href={links.facebook}>Facebook</ShareLink>
        <ShareLink href={links.linkedin}>LinkedIn</ShareLink>
        <a className={styles.button} href={links.email}>
          <Icon name="email" size={18} />
          Email
        </a>
        <button
          type="button"
          className={styles.button}
          onClick={async () => {
            if (await copyText(url)) setCopied(true);
            else dispatch(toastShown({ message: 'Couldn’t copy the link.', tone: 'warning' }));
          }}
        >
          <Icon name={copied ? 'check' : 'link'} size={18} />
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="visually-hidden" role="status">
        {copied ? 'Link copied' : ''}
      </p>
    </section>
  );
}

/**
 * A network's share page, in a new tab.
 *
 * @param {{ href: string, children: import('react').ReactNode }} props
 */
function ShareLink({ href, children }) {
  return (
    <a className={styles.button} href={href} target="_blank" rel="noopener noreferrer">
      {children} <span className="visually-hidden">(opens in a new tab)</span>
    </a>
  );
}

/**
 * The Share button in the story page's header: the device's share sheet where
 * there is one (most phones), otherwise it copies the link.
 *
 * @param {{ title: string, url: string, className?: string }} props
 */
export function ShareButton({ title, url, className = '' }) {
  const dispatch = useDispatch();
  return (
    <button
      type="button"
      className={`${styles.headerButton} ${className}`}
      aria-label="Share story"
      onClick={async () => {
        if (typeof navigator.share === 'function') {
          try {
            await navigator.share({ title, url });
          } catch {
            // The reader closed the share sheet; nothing to do.
          }
          return;
        }
        const copied = await copyText(url);
        dispatch(
          toastShown(
            copied
              ? { message: 'Copied the link to the story' }
              : { message: 'Couldn’t copy the link.', tone: 'warning' },
          ),
        );
      }}
    >
      <Icon name="share" size={18} />
      <span className={styles.headerLabel} aria-hidden="true">
        Share
      </span>
    </button>
  );
}
