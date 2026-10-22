import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initVaultStore } from './utils/vaultStore';
import { isNativeApp } from './native/daymarkBridge';
import { installBackButton } from './native/backButton';
import { LOGOUT_PENDING_KEY, retryPendingLogout } from './utils/logoutPending';

async function start() {
  if (!isNativeApp() && localStorage.getItem(LOGOUT_PENDING_KEY) === '1') {
    if (await retryPendingLogout()) location.replace('/');
    else {
      document.getElementById('root')!.textContent = 'Unable to reach the server to finish signing out. Reconnect to continue.';
      window.addEventListener('online', () => { void start(); }, { once: true });
    }
    return;
  }

  // Hydrate the vault before rendering so the app never flashes empty data.
  await initVaultStore();
  createRoot(document.getElementById('root')!).render(<App />);
  void installBackButton();

  // Offline support: only in production browser builds. A dev service worker would cache stale
  // modules, and the Android app already bundles every asset locally.
  if (import.meta.env.PROD && !isNativeApp() && 'serviceWorker' in navigator) {
    const register = () =>
      navigator.serviceWorker.register('/sw.js').catch((err) => console.error('Service worker registration failed', err));
    // The vault init above is async, so the window may already have finished loading
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
  }
}

void start();
