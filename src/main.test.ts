import { afterEach, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { initVaultStore } from './utils/vaultStore';

vi.mock('react-dom/client', () => ({ createRoot: vi.fn() }));
vi.mock('./App.tsx', () => ({ default: () => null }));
vi.mock('./utils/vaultStore', () => ({ initVaultStore: vi.fn() }));
vi.mock('./native/daymarkBridge', () => ({ isNativeApp: () => false }));
vi.mock('./native/backButton', () => ({ installBackButton: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it('never starts the app or sync while logout fails and redirects after reconnecting', async () => {
  const values = new Map([['daymark_logout_pending', '1']]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key) });
  const root = { textContent: '' };
  vi.stubGlobal('document', { getElementById: () => root });
  const windowEvents = new EventTarget();
  vi.stubGlobal('window', windowEvents);
  const replace = vi.fn();
  vi.stubGlobal('location', { replace });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Response()));
  await import('./main');
  await vi.waitFor(() => expect(root.textContent).toContain('finish signing out'));
  expect(initVaultStore).not.toHaveBeenCalled();
  expect(createRoot).not.toHaveBeenCalled();
  expect(values.size).toBe(1);
  windowEvents.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  expect(values.size).toBe(0);
  expect(createRoot).not.toHaveBeenCalled();
});
