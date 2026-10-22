import { afterEach, expect, it, vi } from 'vitest';
import { encodeImage } from './photoEncoder';
afterEach(() => vi.unstubAllGlobals());
it('resizes, averages linear thumbnail luminance, uses WebP and falls back to JPEG', async () => {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', async () => ({ width: 5000, height: 2500, close }));
  const requests: unknown[] = [];
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) {}
    getContext() { return { fillRect: () => {}, drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray([0,0,0,255,255,255,255,255]) }) }; }
    async convertToBlob(options: { type: string; quality: number }) {
      requests.push(options);
      return new Blob(['photo'], { type: options.type === 'image/webp' ? 'image/png' : options.type });
    }
  });
  const result = await encodeImage(new File(['x'], 'x.png'), 320);
  expect(result.width).toBe(320); expect(result.height).toBe(160);
  expect(result.luminance).toBeCloseTo(0.5);
  expect(result.blob.type).toBe('image/jpeg');
  expect(requests).toEqual([{ type: 'image/webp', quality: 0.82 }, { type: 'image/jpeg', quality: 0.82 }]);
  expect(close).toHaveBeenCalledOnce();
});


it('uses an HTML canvas when OffscreenCanvas is unavailable', async () => {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', async () => ({ width: 800, height: 600, close }));
  vi.stubGlobal('OffscreenCanvas', undefined);
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ fillRect: () => {}, drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray([255, 0, 0, 255]) }) }),
    toBlob: (callback: (blob: Blob) => void, type: string, quality: number) => {
      expect(quality).toBe(0.82); callback(new Blob(['photo'], { type }));
    },
  };
  vi.stubGlobal('document', { createElement: () => canvas });
  const result = await encodeImage(new File(['x'], 'x.png'), 320);
  expect([canvas.width, canvas.height]).toEqual([320, 240]);
  expect(result.luminance).toBeCloseTo(0.2126);
  expect(result.blob.type).toBe('image/webp');
  expect(close).toHaveBeenCalledOnce();
});
