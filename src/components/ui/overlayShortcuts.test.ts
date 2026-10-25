import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ open: false, effects: [] as (() => void | (() => void))[], panel: {
  querySelectorAll: () => [], querySelector: () => null, focus: () => {},
  getBoundingClientRect: () => ({ top: 40, bottom: 80, left: 40, right: 80, width: 208 }), scrollHeight: 100,
} }));
vi.mock('react', async (original) => ({
  ...await original<typeof React>(),
  useState: () => [hooks.open, vi.fn()],
  useRef: (initial: unknown) => ({ current: initial ?? hooks.panel }),
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useLayoutEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useId: () => 'overlay-test',
}));
vi.mock('react-dom', () => ({ createPortal: (node: React.ReactNode) => node }));
import { Dialog, isDialogOpen } from './Dialog';
import { Menu, isMenuOpen } from './Menu';

let cleanups: (() => void)[];
function mountEffects() {
  const effects = hooks.effects.splice(0);
  const dispose = effects.map((effect) => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === 'function');
  const cleanup = () => dispose.splice(0).forEach((fn) => fn());
  cleanups.push(cleanup);
  return cleanup;
}
beforeEach(() => {
  hooks.open = false; hooks.effects = []; cleanups = [];
  vi.stubGlobal('document', { body: {}, activeElement: null, getElementById: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { cleanups.forEach((cleanup) => cleanup()); vi.unstubAllGlobals(); });

it('keeps the dialog signal active until the final stacked dialog closes', () => {
  expect(isDialogOpen()).toBe(false);
  Dialog({ isOpen: true, onClose: vi.fn(), title: 'Settings', children: null });
  const first = mountEffects();
  Dialog({ isOpen: true, onClose: vi.fn(), title: 'Details', children: null });
  const second = mountEffects();
  expect(isDialogOpen()).toBe(true);
  first(); expect(isDialogOpen()).toBe(true);
  second(); expect(isDialogOpen()).toBe(false);
});
it('keeps the menu signal active until every open menu is cleaned up', () => {
  expect(isMenuOpen()).toBe(false);
  hooks.open = true;
  Menu({ trigger: () => null, items: [] }); const first = mountEffects();
  Menu({ trigger: () => null, items: [] }); const second = mountEffects();
  expect(isMenuOpen()).toBe(true);
  second(); expect(isMenuOpen()).toBe(true);
  first(); expect(isMenuOpen()).toBe(false);
});
it('does not register closed dialogs or menus', () => {
  Dialog({ isOpen: false, onClose: vi.fn(), title: 'Settings', children: null });
  Menu({ trigger: () => null, items: [] }); mountEffects();
  expect(isDialogOpen()).toBe(false); expect(isMenuOpen()).toBe(false);
});
