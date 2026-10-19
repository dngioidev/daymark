import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initVaultStore } from './utils/vaultStore';

// Hydrate the vault from IndexedDB before the first render so the app never flashes empty data
initVaultStore().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);

  // Offline support: only in production builds (a dev service worker would cache stale modules)
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const register = () =>
      navigator.serviceWorker.register('/sw.js').catch((err) => console.error('Service worker registration failed', err));
    // The vault init above is async, so the window may already have finished loading
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
  }
});
