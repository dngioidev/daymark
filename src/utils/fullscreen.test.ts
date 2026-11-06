// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { enterFullscreen, exitFullscreen } from './fullscreen';
beforeEach(() => { Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false }); });
afterEach(() => vi.restoreAllMocks());
it('fullscreen helpers are no-ops without document.fullscreenEnabled', async () => {
  const el = document.createElement('div');
  const enter = vi.fn(); const exit = vi.fn();
  Object.defineProperty(el, 'requestFullscreen', { configurable: true, value: enter });
  vi.spyOn(document, 'fullscreenEnabled', 'get').mockReturnValue(false);
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  await enterFullscreen(el); await exitFullscreen();
  expect(enter).not.toHaveBeenCalled(); expect(exit).not.toHaveBeenCalled();
});
it('requests and exits fullscreen when supported and swallows failures', async () => {
  vi.spyOn(document, 'fullscreenEnabled', 'get').mockReturnValue(true);
  const el = document.createElement('div'); const enter = vi.fn().mockResolvedValue(undefined); const exit = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(el, 'requestFullscreen', { configurable: true, value: enter });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  await enterFullscreen(el); await exitFullscreen(); expect(enter).toHaveBeenCalledOnce(); expect(exit).toHaveBeenCalledOnce();
  enter.mockRejectedValue(new Error('denied')); exit.mockImplementation(() => { throw new Error('inactive'); });
  await expect(enterFullscreen(el)).resolves.toBeUndefined(); await expect(exitFullscreen()).resolves.toBeUndefined();
});

