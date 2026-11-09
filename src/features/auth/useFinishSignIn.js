import { useEffect } from 'react';
import { useStore } from 'react-redux';
import { useLocation, useNavigate } from 'react-router';
import { authConfig } from './authConfig.js';

/** The redirect being finished, so it's handled once (React may run effects twice). */
let finishing = /** @type {string|null} */ (null);

/**
 * Notices when Auth0 sends the reader back to Feedolio with ?code=…&state=…
 * (or ?error=… if they cancelled), and finishes the sign-in. The code that
 * does it loads only then.
 */
export function useFinishSignIn() {
  const store = /** @type {import('../../app/store.js').AppStore} */ (useStore());
  const navigate = useNavigate();
  const { search, pathname } = useLocation();

  useEffect(() => {
    if (!authConfig()) return;
    const params = new URLSearchParams(search);
    const state = params.get('state');
    if (!state || !(params.has('code') || params.has('error')) || finishing === state) return;
    finishing = state;
    import('./finishSignIn.js').then(({ finishSignIn }) =>
      finishSignIn({ store, navigate, params, pathname }),
    );
  }, [navigate, pathname, search, store]);
}
