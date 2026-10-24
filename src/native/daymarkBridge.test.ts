import { beforeEach, describe, expect, it, vi } from 'vitest';

const { native, setSystemBars, habitSnapshot, pinHabits, widgets } = vi.hoisted(() => ({ native: vi.fn(), setSystemBars: vi.fn(), habitSnapshot: vi.fn(), pinHabits: vi.fn(), widgets: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: native },
  registerPlugin: () => ({ setSystemBars, setHabitSnapshot: habitSnapshot, pinHabitsWidget: pinHabits, listWidgets: widgets }),
}));
import { applySystemBars, setHabitSnapshot, pinHabitsWidget, listWidgets } from './daymarkBridge';

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


describe('habit widget bridge', () => {
  const snapshot = { date: '2026-10-21', updatedAt: '2026-10-21T10:00:00.000Z', habits: [] };
  it('does not invoke native habit methods in the browser', async () => {
    native.mockReturnValue(false);
    await setHabitSnapshot(snapshot);
    expect(await pinHabitsWidget()).toBe(false);
    expect(habitSnapshot).not.toHaveBeenCalled();
    expect(pinHabits).not.toHaveBeenCalled();
  });
  it('sends habit snapshots and pin requests on native', async () => {
    native.mockReturnValue(true);
    pinHabits.mockResolvedValue({ requested: true });
    await setHabitSnapshot(snapshot);
    expect(habitSnapshot).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(await pinHabitsWidget()).toBe(true);
  });
  it('logs native failures without rejecting', async () => {
    native.mockReturnValue(true);
    habitSnapshot.mockRejectedValue(new Error('not implemented'));
    pinHabits.mockRejectedValue(new Error('not implemented'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(setHabitSnapshot(snapshot)).resolves.toBeUndefined();
      expect(await pinHabitsWidget()).toBe(false);
      expect(log).toHaveBeenCalledTimes(2);
    } finally { log.mockRestore(); }
  });
  it('parses missing widget kinds as tasks while preserving habits', async () => {
    native.mockReturnValue(true);
    widgets.mockResolvedValue({ widgets: [{ id: 1 }, { id: 2, kind: 'habits' }], defaultStyle: {} });
    expect((await listWidgets()).widgets).toMatchObject([{ id: 1, kind: 'tasks', style: { show: { streaks: true } } }, { id: 2, kind: 'habits' }]);
  });
});
