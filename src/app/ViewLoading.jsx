import styles from './RouteStates.module.css';

/** Shown inside the shell while a view's code loads on the first visit. */
export default function ViewLoading() {
  return (
    <p role="status" className={styles.loading}>
      Loading…
    </p>
  );
}
