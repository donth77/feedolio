import { useEffect } from 'react';
import styles from './PageHeader.module.css';

/**
 * A view's title (its one h1) and an optional line under it. Also names the
 * browser tab after the view.
 *
 * @param {{ title: string, description?: string }} props
 */
export default function PageHeader({ title, description }) {
  useEffect(() => {
    document.title = `${title} · Feedolio`;
  }, [title]);

  return (
    <div className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      {description && <p className={styles.description}>{description}</p>}
    </div>
  );
}
