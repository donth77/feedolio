import { lazy, Suspense, useEffect, useId, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import { toastShown } from '../../app/toastSlice.js';
import Icon from '../../components/Icon.jsx';
import styles from './AddFeedDialog.module.css';

// Loaded the first time the dialog opens, to keep the first page light.
const AddFeedForm = lazy(() => import('./AddFeedForm.jsx'));

/**
 * "Add a feed", as a modal dialog. Esc, Close, Cancel or a click outside
 * closes it. Adding a feed opens that feed's page.
 *
 * @param {{ open: boolean, onClose: () => void }} props
 */
export default function AddFeedDialog({ open, onClose }) {
  const dialog = useRef(/** @type {HTMLDialogElement|null} */ (null));
  const headingId = useId();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      // showModal() focuses the first control (Close); the link field is what the reader wants.
      element.querySelector('input')?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={headingId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself.
        if (event.target === dialog.current) onClose();
      }}
    >
      {open && (
        <div className={styles.inner}>
          <div className={styles.head}>
            <h2 id={headingId} className={styles.title}>
              Add a feed
            </h2>
            <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
          <Suspense fallback={<p className={styles.loading}>Loading…</p>}>
            <AddFeedForm
              autoFocus
              onCancel={onClose}
              onNavigate={onClose}
              onAdded={({ id, title }) => {
                onClose();
                navigate(`/feeds/${id}`);
                dispatch(toastShown({ message: `Added ${title}` }));
              }}
            />
          </Suspense>
          <p className={styles.hint}>
            <kbd className={styles.kbd}>Enter</kbd> looks up the link{' '}
            <span aria-hidden="true">·</span> <kbd className={styles.kbd}>Esc</kbd> closes
          </p>
        </div>
      )}
    </dialog>
  );
}
