import type { NoteAssetMeta } from '../types/daymark';
import { encodeImage } from './photoEncoder';

/** Decode one still frame (including GIF), resize and encode with the shared photo pipeline. */
export async function encodeNotePicture(file: Blob, encoder: typeof encodeImage = encodeImage): Promise<{
  blob: Blob; width: number; height: number; mime: NoteAssetMeta['mime'];
}> {
  let result = await encoder(file, 1600, 0.8);
  if (result.blob.size > 400 * 1024) result = await encoder(file, 1600, 0.65);
  const mime = result.blob.type;
  if (mime !== 'image/webp' && mime !== 'image/jpeg') throw new Error('This browser cannot encode pictures.');
  return { blob: result.blob, width: result.width, height: result.height, mime };
}
