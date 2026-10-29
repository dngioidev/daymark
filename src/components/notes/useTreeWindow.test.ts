// @vitest-environment jsdom
import React, { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { treeWindow, useTreeWindow } from './useTreeWindow';
it('windows only above 400 rows with ten overscan and keeps a distant focused row mounted', () => {
  expect(treeWindow(400, 32, 640, 320, 0).indices).toHaveLength(400);
  const result = treeWindow(1000, 32, 640, 320, 900);
  expect(result.indices).toEqual([...Array.from({ length: 30 }, (_, i) => i + 10), 900]);
  expect(result.totalHeight).toBe(32000);
  expect(treeWindow(1000, 44, 440, 440, 10).indices).toHaveLength(30);
});
it('scrolls a keyboard target into the window', () => {
  let api: ReturnType<typeof useTreeWindow>; let viewport: HTMLDivElement;
  function Harness() { const ref = useRef<HTMLDivElement>(null); api = useTreeWindow(1000, 32, ref, 0); return React.createElement('div', { ref }); }
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); const root = createRoot(host); act(() => root.render(React.createElement(Harness)));
  viewport = host.firstElementChild as HTMLDivElement; Object.defineProperty(viewport, 'clientHeight', { value: 320 });
  act(() => api.scrollToIndex(900)); expect(viewport.scrollTop).toBe(28512); expect(api!.indices).toContain(900);
  act(() => root.unmount());
});
