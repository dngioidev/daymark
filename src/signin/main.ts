import '../index.css';
import { WEB_CLIENT_HEADER } from '../sync/protocol';
import { defaultDeviceName, getInstallId } from '../utils/deviceName';
import { prepareSignIn } from './startup';

const form = document.getElementById('signin-form') as HTMLFormElement;
const username = document.getElementById('username') as HTMLInputElement;
const password = document.getElementById('password') as HTMLInputElement;
const error = document.getElementById('signin-error') as HTMLParagraphElement;
const submit = document.getElementById('signin-submit') as HTMLButtonElement;

let ready = false;
let preparing = false;
let needsRetry = true;
async function start() {
  if (!needsRetry || preparing) return;
  preparing = true;
  try {
    const result = await prepareSignIn();
    ready = result === 'ready' || result === 'offline';
    needsRetry = result === 'offline' || result === 'logout-pending';
    form.hidden = !ready;
    error.textContent = result === 'offline'
      ? 'Unable to check your session. You may be offline. Reconnect to try again.'
      : result === 'logout-pending'
        ? 'Unable to reach the server to finish signing out. Reconnect to continue.' : '';
  } catch {
    error.textContent = 'Could not clear this browser vault. Reload to try again.';
  } finally { preparing = false; }
}
void start();
window.addEventListener('online', () => { void start(); });

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!ready || submit.disabled) return;
  submit.disabled = true;
  error.textContent = '';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [WEB_CLIENT_HEADER]: 'web' },
      body: JSON.stringify({ username: username.value, password: password.value, deviceName: defaultDeviceName(), platform: 'web', installId: getInstallId() }),
    });
    if (response.status === 200) {
      location.replace(location.pathname === '/signin.html' ? '/' : location.href);
    } else {
      const data = await response.json();
      error.textContent = data.error || 'Unable to sign in. Try again.';
    }
  } catch {
    error.textContent = 'Unable to reach the server. Check your connection and try again.';
  } finally {
    submit.disabled = false;
  }
});
