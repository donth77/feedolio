import { useEffect } from 'react';
import { useStore } from 'react-redux';
import { useLocation, useNavigate } from 'react-router';

/** A sign-in being finished, so it's handled once (React may run effects twice). */
let finishing = false;

/**
 * Notices when the Worker brings the reader back from GitHub with
 * ?signin=ok (or cancelled, off, failed), and finishes the sign-in. The code
 * that does it loads only then.
 */
export function useFinishSignIn() {
  const store = /** @type {import('../../app/store.js').AppStore} */ (useStore());
  const navigate = useNavigate();
  const { search, pathname } = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (!params.has('signin') || finishing) return;
    finishing = true;
    import('./finishSignIn.js')
      .then(({ finishSignIn }) => finishSignIn({ store, navigate, params, pathname }))
      .finally(() => {
        finishing = false;
      });
  }, [navigate, pathname, search, store]);
}
