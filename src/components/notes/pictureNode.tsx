import Image from '@tiptap/extension-image';
import type { Editor, JSONContent } from '@tiptap/core';
import { TextSelection, type Transaction } from '@tiptap/pm/state';
import { assetRef, getAssetUrl, putAsset } from '../../utils/noteAssets';
import { encodeNotePicture } from '../../utils/notePicture';
import { showToast } from '../ui/feedback';

const assetSource = /^daymark-asset:([a-f0-9]{64})\.(?:webp|jpeg|jpg|png)$/;
export function isPictureSource(src: string): boolean {
  if (assetSource.test(src)) return true;
  try { return /^https:\/\//i.test(src) && new URL(src).protocol === 'https:'; }
  catch { return false; }
}

/** Keep the Markdown src in the document; blob URLs belong only to this view. */
export const Picture = Image.extend({
  renderMarkdown(node) {
    const alt = String(node.attrs?.alt ?? '').replace(/[\\[\]]/g, '\\$&');
    const src = String(node.attrs?.src ?? '');
    const destination = /[\s()<>]/.test(src) ? `<${src.replace(/</g, '%3C').replace(/>/g, '%3E')}>` : src;
    const title = node.attrs?.title ? ` "${String(node.attrs.title).replace(/[\\"]/g, '\\$&')}"` : '';
    return `![${alt}](${destination}${title})`;
  },
  parseHTML() {
    return [{ tag: 'img[src]', getAttrs: (element) => isPictureSource(element.getAttribute('src') ?? '') ? null : false }];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.setAttribute('contenteditable', 'false');
      const src = String(node.attrs.src ?? '');
      const id = assetSource.exec(src)?.[1];
      let destroyed = false;
      let request = 0;
      const render = (url: string | null) => {
        dom.replaceChildren();
        dom.removeAttribute('role');
        dom.removeAttribute('aria-label');
        if (!url) {
          dom.textContent = id ? 'Picture not synced yet' : 'Picture unavailable';
          dom.setAttribute('role', 'img');
          dom.setAttribute('aria-label', dom.textContent);
          dom.className = 'inline-block rounded border border-stone-400 bg-stone-100 p-3 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-200';
          return;
        }
        dom.className = 'inline-block w-full max-w-full align-middle';
        const image = document.createElement('img');
        image.setAttribute('loading', 'lazy');
        image.setAttribute('referrerpolicy', 'no-referrer');
        image.style.maxHeight = '70vh';
        image.style.objectFit = 'contain';
        image.style.width = '100%';
        image.alt = node.attrs.alt ?? '';
        if (node.attrs.title) image.title = node.attrs.title;
        image.src = url;
        dom.append(image);
      };
      const resolve = async () => {
        const current = ++request;
        let url: string | null = null;
        try { url = await getAssetUrl(id!); } catch { /* Storage can be unavailable until a later sync. */ }
        if (!destroyed && current === request) render(url);
      };
      const changed = (event: Event) => {
        if ((event as CustomEvent<{ ids: string[] }>).detail?.ids?.includes(id!)) void resolve();
      };
      render(id ? null : isPictureSource(src) ? src : null);
      if (id) { window.addEventListener('daymark-assets-changed', changed); void resolve(); }
      return { dom, ignoreMutation: () => true, destroy() { destroyed = true; window.removeEventListener('daymark-assets-changed', changed); } };
    };
  },
}).configure({ inline: true, HTMLAttributes: { loading: 'lazy', referrerpolicy: 'no-referrer' } });

/** Map the insertion bookmark through edits made while encoding/storage is pending. */
export async function insertPictureFiles(editor: Editor, files: readonly File[], position?: number): Promise<void> {
  let bookmark = (position === undefined ? editor.state.selection : TextSelection.near(editor.state.doc.resolve(position))).getBookmark();
  const map = ({ transaction }: { transaction: Transaction }) => { bookmark = bookmark.map(transaction.mapping); };
  editor.on('transaction', map);
  try {
    const pictures: JSONContent[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const { blob, ...meta } = await encodeNotePicture(file);
        if (editor.isDestroyed) return;
        const id = await putAsset(blob, { ...meta, createdAt: new Date().toISOString() });
        pictures.push({ type: 'image', attrs: { src: assetRef(id, meta.mime), alt: file.name.replace(/\.[^.]+$/, '') } });
      } catch (error) {
        if (!editor.isDestroyed) showToast(error instanceof Error ? error.message : 'Could not save this picture.', { tone: 'error' });
      }
      if (editor.isDestroyed) return;
    }
    if (pictures.length) {
      const { from, to } = bookmark.resolve(editor.state.doc);
      // Keep the image schema inline for legacy notes, but insert new pictures
      // as separate paragraphs. TipTap splits text and reuses empty paragraphs.
      editor.commands.insertContentAt({ from, to }, pictures.map(picture => ({ type: 'paragraph', content: [picture] })));
    }
  } finally { editor.off('transaction', map); }
}
