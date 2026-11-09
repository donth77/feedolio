import { setupListeners } from '@reduxjs/toolkit/query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './app/App.jsx';
import { createAppRouter } from './app/router.jsx';
import { makeStore } from './app/store.js';

const store = makeStore();
// Refetches feeds when the browser comes back online.
setupListeners(store.dispatch);
const router = createAppRouter();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App store={store} router={router} />
  </StrictMode>,
);
