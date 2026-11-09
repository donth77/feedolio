import { useEffect, useId, useRef } from 'react';
import Icon from '../../components/Icon.jsx';
import styles from './ShortcutsDialog.module.css';

/** Each shortcut, as keys and the words between them. */
const SHORTCUTS = [
  { label: 'Next or previous story', keys: ['J', 'or', 'K'] },
  { label: 'Open the selected story', keys: ['Enter', 'or', 'O'] },
  { label: 'Open the original on the publisher’s site', keys: ['V'] },
  { label: 'Save or unsave', keys: ['S'] },
  { label: 'Refresh feeds', keys: ['R'] },
  { label: 'Search (within the feed you’re in)', keys: ['/'] },
  { label: 'Collapse or expand the sidebar', keys: ['['] },
  { label: 'Move the focused feed up or down', keys: ['Alt', '+', '↑', 'or', '↓'] },
  { label: 'Go to Today', keys: ['G', 'then', 'T'] },
  { label: 'Go to All stories', keys: ['G', 'then', 'A'] },
  { label: 'Go to Saved', keys: ['G', 'then', 'S'] },
  { label: 'Show shortcuts', keys: ['?'] },
  { label: 'Close a dialog or menu', keys: ['Esc'] },
];
const WORDS = new Set(['or', 'then', '+']);

/**
 * Every keyboard shortcut, as a modal dialog. Opens with `?`.
 *
 * @param {{ open: boolean, onClose: () => void }} props
 */
export default function ShortcutsDialog({ open, onClose }) {
  const dialog = useRef(/** @type {HTMLDialogElement|null} */ (null));
  const headingId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={headingId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      {open && (
        <div className={styles.inner}>
          <div className={styles.head}>
            <h2 id={headingId} className={styles.title}>
              Keyboard shortcuts
            </h2>
            <button
              type="button"
              className={styles.close}
              aria-label="Close shortcuts"
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          </div>
          <dl className={styles.list}>
            {SHORTCUTS.map(({ label, keys }) => (
              <div key={label} className={styles.row}>
                <dt>{label}</dt>
                <dd className={styles.keys}>
                  {keys.map((key, index) =>
                    WORDS.has(key) ? (
                      <span key={index} className={styles.word}>
                        {key}
                      </span>
                    ) : (
                      <kbd key={index} className={styles.kbd}>
                        {key}
                      </kbd>
                    ),
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className={styles.help}>
            Shortcuts pause while you’re typing in a field. Press{' '}
            <kbd className={styles.kbd}>?</kbd> any time to see this list.
          </p>
        </div>
      )}
    </dialog>
  );
}
