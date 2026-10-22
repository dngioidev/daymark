import { beforeEach, describe, expect, it, vi } from 'vitest';

const { native, setSystemBars } = vi.hoisted(() => ({ native: vi.fn(), setSystemBars: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: native },
  registerPlugin: () => ({ setSystemBars }),
}));
import { applySystemBars } from './daymarkBridge';

beforeEach(() => {
  vi.resetAllMocks();
  setSystemBars.mockResolvedValue(undefined);
});

describe('applySystemBars', () => {
  it('resolves without calling the plugin on the web', async () => {
    native.mockReturnValue(false);
    await expect(applySystemBars('#123456', true)).resolves.toBeUndefined();
    expect(setSystemBars).not.toHaveBeenCalled();
  });

  it.each([true, false])('passes the colour and lightIcons=%s to Android', async (lightIcons) => {
    native.mockReturnValue(true);
    await expect(applySystemBars('#123456', lightIcons)).resolves.toBeUndefined();
    expect(setSystemBars).toHaveBeenCalledExactlyOnceWith({ color: '#123456', lightIcons });
  });

  it('reports a native failure without rejecting the appearance update', async () => {
    native.mockReturnValue(true);
    const error = new Error('Unavailable');
    setSystemBars.mockRejectedValue(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(applySystemBars('#123456', false)).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledWith('Could not update the system bars', error);
    } finally {
      log.mockRestore();
    }
  });
});
