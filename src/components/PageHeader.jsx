import { useEffect } from 'react';
import styles from './PageHeader.module.css';

/**
 * A view's title (its one h1), an optional line under it, and optional
 * controls beside it. Also names the browser tab after the view.
 *
 * @param {{
 *   title: string,
 *   description?: import('react').ReactNode,
 *   actions?: import('react').ReactNode,
 * }} props
 */
export default function PageHeader({ title, description, actions }) {
  useEffect(() => {
    document.title = `${title} · Feedolio`;
  }, [title]);

  return (
    <div className={styles.header}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
