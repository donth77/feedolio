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
 *   documentTitle?: string,
 * }} props
 *   documentTitle: names the tab when it should differ from the heading
 */
export default function PageHeader({ title, description, actions, documentTitle = title }) {
  useEffect(() => {
    document.title = `${documentTitle} · Feedolio`;
  }, [documentTitle]);

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
