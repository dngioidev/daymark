import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNativeApp } from '../native/daymarkBridge';
import { getHostMode } from './hostMode';

vi.mock('../native/daymarkBridge', () => ({ isNativeApp: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe('getHostMode', () => {
  it('native wins over cookies', () => {
    vi.mocked(isNativeApp).mockReturnValue(true);
    vi.stubGlobal('document', { cookie: 'daymark_signed_in=1' });
    expect(getHostMode()).toBe('native');
  });

  it('marker cookie means server', () => {
    vi.mocked(isNativeApp).mockReturnValue(false);
    vi.stubGlobal('document', { cookie: 'other=1; daymark_signed_in=1; theme=dark' });
    expect(getHostMode()).toBe('server');
  });

  it('no marker means local-web', () => {
    vi.mocked(isNativeApp).mockReturnValue(false);
    for (const cookie of ['', 'daymark_signed_in=0', 'other_daymark_signed_in=1', 'daymark_signed_in=10']) {
      vi.stubGlobal('document', { cookie });
      expect(getHostMode()).toBe('local-web');
    }
  });
});
