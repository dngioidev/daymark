import type { InkPage } from '../types/daymark';
import { inkKey } from './inkModel';

/** Strokes are immutable; edits replace the page and advance its time and/or counts. */
export const inkPageVersion = (page: InkPage): string =>
  page.updatedAt + ':' + page.strokes.length + ':' + page.removed.length;
export function sameInkPage(a: InkPage | null, b: InkPage | null): boolean {
  return a === b || !!a && !!b && a.noteId === b.noteId && a.page === b.page && inkPageVersion(a) === inkPageVersion(b);
}
export function sameInkPages(a: InkPage[], b: InkPage[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const versions = new Map(a.map(page => [inkKey(page.noteId, page.page), inkPageVersion(page)]));
  return b.every(page => versions.get(inkKey(page.noteId, page.page)) === inkPageVersion(page));
}
