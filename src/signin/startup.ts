import { wipeLocalVault } from '../utils/vaultStore';
import { withRefreshLock } from '../sync/authClient';
import { LOGOUT_PENDING_KEY, retryPendingLogout } from '../utils/logoutPending';
import { SIGNED_IN_COOKIE, WEB_CLIENT_HEADER } from '../sync/protocol';

export type SignInStartup = 'ready' | 'offline' | 'logout-pending' | 'redirecting';

/** The gate may serve this page after revocation while no app tab was open. */
export async function prepareSignIn(): Promise<SignInStartup> {
  if (localStorage.getItem(LOGOUT_PENDING_KEY) === '1') {
    await wipeLocalVault();
    return await retryPendingLogout() ? 'ready' : 'logout-pending';
  }
  // A restored sign-in tab must not erase edits in an active app tab.
  if (document.cookie.split(';').some((cookie) => cookie.trim() === `${SIGNED_IN_COOKIE}=1`)) {
    let response: Response;
    try {
      response = await withRefreshLock(() => fetch('/api/auth/refresh', {
        method: 'POST', headers: { [WEB_CLIENT_HEADER]: 'web' }, credentials: 'same-origin',
      }));
    } catch {
      return 'offline';
    }
    if (response.ok) {
      location.replace('/');
      return 'redirecting';
    }
    // Only an authoritative rejection establishes that cleanup is safe.
    if (response.status !== 401) return 'offline';
    await wipeLocalVault();
  }
  return await retryPendingLogout() ? 'ready' : 'logout-pending';
}
