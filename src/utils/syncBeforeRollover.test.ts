import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROLLOVER_SYNC_WAIT_MS, waitForSync } from './syncBeforeRollover';

afterEach(() => { vi.useRealTimers(); });

describe('waitForSync', () => {
  it('resolves once the sync finishes', async () => {
    let finish!: (ok: boolean) => void;
    const done = vi.fn();
    void waitForSync(() => new Promise<boolean>((r) => { finish = r; })).then(done);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    finish(true);
    await vi.waitFor(() => expect(done).toHaveBeenCalled());
  });

  it('resolves when the sync fails (offline, server down)', async () => {
    await expect(waitForSync(() => Promise.reject(new Error('offline')))).resolves.toBeUndefined();
  });

  it('stops waiting after the time limit', async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    void waitForSync(() => new Promise<boolean>(() => undefined)).then(done);
    await vi.advanceTimersByTimeAsync(ROLLOVER_SYNC_WAIT_MS - 1);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it('resolves when starting the sync throws', async () => {
    await expect(waitForSync(() => { throw new Error('signed out'); })).resolves.toBeUndefined();
  });
});
