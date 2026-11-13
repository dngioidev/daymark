import fs from 'node:fs';

/** Windows codes for a file another process (antivirus, indexer) briefly holds open. */
const TRANSIENT_WINDOWS = new Set(['EPERM', 'EBUSY', 'EACCES']);
const WAITS_MS = [10, 20, 40, 80, 160];

const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

interface RenameOptions {
  platform?: NodeJS.Platform;
  rename?: (from: string, to: string) => void;
  sleep?: (ms: number) => void;
}

/**
 * Renames `from` over `to`, the publish step of an atomic write. On Windows a freshly
 * written file can be locked for a moment by antivirus or the search indexer, so a
 * lock error is retried a few times (about 310 ms in total) before it is thrown.
 */
export function renameWithRetry(from: string, to: string, options: RenameOptions = {}): void {
  const { platform = process.platform, rename = fs.renameSync, sleep = sleepSync } = options;
  for (let attempt = 0; ; attempt += 1) {
    try {
      rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (platform !== 'win32' || !TRANSIENT_WINDOWS.has(code) || attempt >= WAITS_MS.length) throw err;
      sleep(WAITS_MS[attempt]);
    }
  }
}
