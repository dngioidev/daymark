import { wipeLocalVault } from '../utils/vaultStore';
import { retryPendingLogout } from '../utils/logoutPending';

/** The gate may serve this page after revocation while no app tab was open. */
export async function prepareSignIn(): Promise<boolean> {
  await wipeLocalVault();
  return retryPendingLogout();
}
