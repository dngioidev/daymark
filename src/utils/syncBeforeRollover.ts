/** Longest wait for the pull before a new day is rolled over anyway (offline, slow server). */
export const ROLLOVER_SYNC_WAIT_MS = 8000;

/**
 * Waits for one sync round, never longer than the limit, and never rejects. Rolling over after
 * the pull keeps a device that slept through another device's work from carrying tasks that
 * were finished meanwhile.
 */
export function waitForSync(syncNow: () => Promise<unknown>, limitMs = ROLLOVER_SYNC_WAIT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => { timer = setTimeout(resolve, limitMs); });
  let round: Promise<unknown>;
  try {
    round = syncNow();
  } catch {
    round = Promise.resolve();
  }
  return Promise.race([round.then(() => undefined, () => undefined), limit]).finally(() => clearTimeout(timer));
}
