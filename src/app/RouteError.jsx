import { useEffect } from 'react';
import { useRouteError } from 'react-router';
import PageHeader from '../components/PageHeader.jsx';
import styles from './RouteStates.module.css';

/** Shown instead of a view that crashed. */
export default function RouteError() {
  const error = useRouteError();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader
        title="Something went wrong"
        description="This page couldn’t be shown. Reloading usually fixes it."
      />
      <button type="button" className={styles.button} onClick={() => window.location.reload()}>
        Reload
      </button>
    </>
  );
}
