import type { InkPage, StandaloneNote } from '../types/daymark';
import { textBoxAnchor, visibleTextBoxes } from '../ink/inkText';
import { extractTags, mergeTags } from './noteTags';

/** Visible text-box text of a handwritten note: pages in order, then top to bottom, left to right. */
export function handwrittenText(pages: InkPage[]): string {
  return [...pages].sort((a, b) => a.page - b.page).flatMap(page => visibleTextBoxes(page)
    .map(box => ({ text: box.text ?? '', ...textBoxAnchor(box) }))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(box => box.text))
    .filter(text => text.trim()).join('\n\n');
}

/** Stored tags (legacy sample tags, the handwritten tag field) then tags read from the text. */
export function effectiveTags(note: StandaloneNote, text = note.content): string[] {
  return mergeTags(note.tags, extractTags(text));
}

const cache = new WeakMap<StandaloneNote, { pages: InkPage[] | null; result: StandaloneNote }>();
const NO_PAGES = null;

/** Read-only copies for search, tags, Graph and Related: effective tags, and for
 * handwritten notes their text-box text as content. Never save these objects. */
export function knowledgeNotes(notes: StandaloneNote[], pagesFor: (noteId: string) => InkPage[]): StandaloneNote[] {
  return notes.map(note => {
    const pages = note.kind === 'handwritten' ? pagesFor(note.id) : NO_PAGES;
    const hit = cache.get(note);
    if (hit && hit.pages === pages) return hit.result;
    const content = pages ? handwrittenText(pages) : note.content;
    const result = { ...note, content, tags: effectiveTags(note, content) };
    cache.set(note, { pages, result });
    return result;
  });
}
