import { afterEach, expect, it, vi } from 'vitest';
import { resolveAppearance } from '../utils/appearance';
import { DEFAULT_APPEARANCE } from '../utils/defaultData';
import { useWidgetSync } from './useWidgetSync';

const { effects, consume, colors } = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], consume: vi.fn(), colors: vi.fn() }));
vi.mock('react', () => ({ useRef: (current: unknown) => ({ current }), useEffect: (effect: () => void) => effects.push(effect) }));
vi.mock('../native/daymarkBridge', () => ({ isNativeApp: () => true, consumeWidgetActions: consume, setAppColors: colors, pushWidgetSnapshot: vi.fn() }));
afterEach(() => { effects.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('opens the requested widget editor and sends opaque resolved app colours', async () => {
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  consume.mockResolvedValue([{ type: 'configure', widgetId: 42 }, { type: 'capture' }, { type: 'toggle', taskId: 'a' }]);
  const configure = vi.fn(), capture = vi.fn(), toggle = vi.fn();
  const appearance = resolveAppearance({ ...DEFAULT_APPEARANCE, theme: 'dark' }, null);
  useWidgetSync('2026-10-23', undefined, toggle, capture, configure, appearance);
  const cleanup = effects.map((effect) => effect());
  await Promise.resolve();
  expect(configure).toHaveBeenCalledExactlyOnceWith(42);
  expect(capture).toHaveBeenCalledOnce();
  expect(toggle).toHaveBeenCalledExactlyOnceWith('a');
  expect(colors).toHaveBeenCalledExactlyOnceWith({ headerBg: '#0c0a09', headerText: appearance.headerText, accent: '#f59e0b', dark: true });
  cleanup.forEach((fn) => fn?.());
});
