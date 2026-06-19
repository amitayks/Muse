import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTelegram } from './lib/telegram';
import { App } from './App';

import '@telegram-apps/telegram-ui/dist/styles.css';
import './styles/tokens.css';

// Initialize the Telegram SDK before React mounts so signals + CSS vars are ready on first paint.
initTelegram();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
