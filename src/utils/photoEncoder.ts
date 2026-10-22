export const MAX_EDGE = 2560;
export const THUMB_EDGE = 320;
export const QUALITY = 0.82;

export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

export async function encodeImage(file: File, maxEdge: number): Promise<{ blob: Blob; width: number; height: number; luminance?: number }> {
  const image = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(image.width, image.height, maxEdge);
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
    const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!context) throw new Error('Could not read this photo.');
    // Flatten transparent images consistently in both encodings and the luminance sample.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    let luminance: number | undefined;
    if (maxEdge === THUMB_EDGE) {
      const { data } = context.getImageData(0, 0, width, height);
      const linear = (v: number) => v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4;
      let total = 0;
      for (let i = 0; i < data.length; i += 4) total += 0.2126 * linear(data[i]) + 0.7152 * linear(data[i + 1]) + 0.0722 * linear(data[i + 2]);
      luminance = total / (data.length / 4);
    }
    const encode = (type: string): Promise<Blob> => 'convertToBlob' in canvas
      ? canvas.convertToBlob({ type, quality: QUALITY })
      : new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode this photo.')), type, QUALITY));
    let blob: Blob;
    try { blob = await encode('image/webp'); }
    catch { blob = await encode('image/jpeg'); }
    if (blob.type !== 'image/webp' && blob.type !== 'image/jpeg') blob = await encode('image/jpeg');
    if (blob.type !== 'image/webp' && blob.type !== 'image/jpeg') throw new Error('This browser cannot encode photos.');
    return { blob, width, height, luminance };
  } finally {
    image.close();
  }
}
