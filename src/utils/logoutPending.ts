import { WEB_CLIENT_HEADER } from '../sync/protocol';

export const LOGOUT_PENDING_KEY = 'daymark_logout_pending';

/** False means startup must stay blocked: a live HttpOnly cookie may remain. */
export async function retryPendingLogout(): Promise<boolean> {
  if (localStorage.getItem(LOGOUT_PENDING_KEY) !== '1') return true;
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST', headers: { [WEB_CLIENT_HEADER]: 'web' }, credentials: 'same-origin',
    });
    if (!response.ok) return false;
    localStorage.removeItem(LOGOUT_PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}
