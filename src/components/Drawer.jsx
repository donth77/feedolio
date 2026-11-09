import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import styles from './Drawer.module.css';

/**
 * A panel that slides in from the left, as a modal dialog: focus stays inside,
 * Esc or a click outside closes it, and the page behind can't be reached.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   label: string,
 *   children: import('react').ReactNode,
 * }} props
 */
export default function Drawer({ open, onClose, label, children }) {
  const dialog = useRef(/** @type {HTMLDialogElement|null} */ (null));

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.drawer}
      aria-label={label}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself.
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className={styles.inner}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close menu">
          <Icon name="close" />
        </button>
        {open && children}
      </div>
    </dialog>
  );
}
