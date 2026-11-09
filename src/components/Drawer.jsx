import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import styles from './Drawer.module.css';

/**
 * A panel that slides in from the left, as a modal dialog: focus stays inside,
 * Esc or a click outside closes it, and the page behind can't be reached. It
 * slides away again before it closes.
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
  // The contents stay while the drawer slides away.
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) {
      // Opened again part-way through closing: the slide stops.
      delete element.dataset.closing;
      if (!element.open) element.showModal();
      return;
    }
    if (!element.open) return;
    element.dataset.closing = '';
    // Close once the slide ends; at once where nothing animates.
    const sliding = element.getAnimations?.() ?? [];
    if (sliding.length === 0) {
      element.close();
      return;
    }
    let current = true;
    Promise.all(sliding.map((animation) => animation.finished)).then(
      () => current && element.close(),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.drawer}
      aria-label={label}
      onCancel={(event) => {
        // Esc slides it away too, where the browser lets it.
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        setShown(false);
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself.
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className={styles.inner}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close menu">
          <Icon name="close" />
        </button>
        {shown && children}
      </div>
    </dialog>
  );
}
