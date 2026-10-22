import '../index.css';
import { WEB_CLIENT_HEADER } from '../sync/protocol';
import { defaultDeviceName, getInstallId } from '../utils/deviceName';

const form = document.getElementById('signin-form') as HTMLFormElement;
const username = document.getElementById('username') as HTMLInputElement;
const password = document.getElementById('password') as HTMLInputElement;
const error = document.getElementById('signin-error') as HTMLParagraphElement;
const submit = document.getElementById('signin-submit') as HTMLButtonElement;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submit.disabled) return;
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
