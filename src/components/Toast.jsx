import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectToast, toastDismissed } from '../app/toastSlice.js';
import Icon from './Icon.jsx';
import styles from './Toast.module.css';

/** How long a message stays, unless the reader is pointing at it or using it. */
export const TOAST_MS = 8_000;

/**
 * The message strip at the bottom of the screen. Its live region is always
 * there, so screen readers announce each new message.
 */
export default function Toast() {
  const toast = useSelector(selectToast);
  return (
    <div className={styles.region} role="status">
      {toast && <Message key={toast.id} toast={toast} />}
    </div>
  );
}

/**
 * @param {{ toast: import('../app/toastSlice.js').Toast }} props
 */
function Message({ toast }) {
  const dispatch = useDispatch();
  const [held, setHeld] = useState(false);
  const dismiss = () => dispatch(toastDismissed(toast.id));

  useEffect(() => {
    if (held) return undefined;
    const timer = setTimeout(() => dispatch(toastDismissed(toast.id)), TOAST_MS);
    return () => clearTimeout(timer);
  }, [dispatch, held, toast.id]);

  return (
    <div
      className={styles.toast}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <Icon name={toast.tone === 'warning' ? 'alert' : 'check'} size={18} className={styles.icon} />
      <span className={styles.message}>{toast.message}</span>
      {toast.undo && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            if (toast.undo) dispatch(toast.undo);
            dismiss();
          }}
        >
          Undo
        </button>
      )}
      <button type="button" className={styles.dismiss} aria-label="Dismiss" onClick={dismiss}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
