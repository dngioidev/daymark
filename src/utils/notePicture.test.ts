import { afterEach, expect, it, vi } from 'vitest';
import { encodeNotePicture } from './notePicture';
import { encodeImage } from './photoEncoder';
afterEach(() => vi.unstubAllGlobals());
it('encodeNotePicture limits a 4000x3000 image to 1600 and encodes WebP at 0.8', async () => {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 4000, height: 3000, close() {} }));
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) {}
    getContext() { return { fillRect() {}, drawImage() {} }; }
    async convertToBlob(options: { type: string; quality: number }) {
      return new Blob([`${this.width},${this.height},${options.quality}`], { type: options.type });
    }
  });
  const result = await encodeNotePicture(new Blob(['gif'], { type: 'image/gif' }));
  expect(result).toMatchObject({ width: 1600, height: 1200, mime: 'image/webp' });
  expect(await result.blob.text()).toBe('1600,1200,0.8');
});
it('re-encodes once at 0.65 above 400 KB using an injectable encoder', async () => {
  const encoder: typeof encodeImage = async (_file, _edge, quality) => ({
    blob: new Blob([new Uint8Array(quality === 0.8 ? 410000 : 300000)], { type: 'image/jpeg' }), width: 1600, height: 1200,
  });
  expect((await encodeNotePicture(new Blob(), encoder)).blob.size).toBe(300000);
});
it('falls back to JPEG when WebP is unavailable', async () => {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 10, height: 20, close() {} }));
  vi.stubGlobal('OffscreenCanvas', class {
    getContext() { return { fillRect() {}, drawImage() {} }; }
    async convertToBlob({ type }: { type: string }) {
      if (type === 'image/webp') throw new Error('unsupported');
      return new Blob(['jpeg'], { type });
    }
  });
  expect((await encodeNotePicture(new Blob())).mime).toBe('image/jpeg');
});
