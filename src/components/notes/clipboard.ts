import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import type { Editor } from '@tiptap/core';
import type { EditorProps } from '@tiptap/pm/view';
import { insertPictureFiles, isPictureSource } from './pictureNode';

// One isolated instance: never change the hooks used by previews or Mermaid.
const pasteSanitizer = DOMPurify(window);
pasteSanitizer.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'class') {
    data.attrValue = node.nodeName === 'CODE'
      ? (data.attrValue.match(/(?:^|\s)(language-[\w+-]+)(?=\s|$)/)?.[1] ?? '') : '';
    data.keepAttr = Boolean(data.attrValue);
  }
  if (data.attrName === 'src') {
    data.keepAttr = node.nodeName === 'IMG' && isPictureSource(data.attrValue);
    data.forceKeepAttr = data.keepAttr;
  }
  if (data.attrName === 'type') data.keepAttr = node.nodeName === 'INPUT' && data.attrValue === 'checkbox';
});

function pasteDocument(html: string): DocumentFragment {
  // Templates are inert: clipboard scripts/resources never enter the live DOM.
  const template = document.createElement('template');
  template.innerHTML = html;
  const fragment = template.content;
  fragment.querySelectorAll('script, style, nav, aside, footer, button, [role="button"], [role="navigation"], [role="banner"], [role="contentinfo"], [class~="advertisement"], [class~="ads"], [class~="ad"], [id="ad"]').forEach(node => node.remove());
  return fragment;
}

export function cleanPastedHtml(html: string): string {
  const fragment = pasteDocument(html);
  // AI code panels put the language/copy toolbar alongside (or inside) pre.
  fragment.querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code');
    const parent = pre.parentElement;
    if (parent && /(?:code-block|code-panel)/.test(parent.className)) {
      Array.from(parent.children).filter(child => child !== pre && !child.contains(pre)).forEach(child => child.remove());
    }
    if (code) { code.textContent = code.textContent?.replace(/\n$/, '') ?? ''; pre.replaceChildren(code); }
  });
  fragment.querySelectorAll('div, span').forEach(node => {
    if (!node.closest('pre') && /^(?:Copy code|Copy|Edit)$/.test(node.textContent?.trim() ?? '')) node.remove();
  });
  // Retain div line boundaries before unwrapping generic layout containers.
  fragment.querySelectorAll('div').forEach(div => {
    if (!div.closest('pre') && div.childNodes.length && !div.querySelector('p, div, h1, h2, h3, h4, h5, h6, ul, ol, pre, table, blockquote')) {
      const p = document.createElement('p'); p.append(...div.childNodes); div.replaceWith(p);
    }
  });
  const container = document.createElement('div'); container.append(fragment);
  const clean = pasteSanitizer.sanitize(container.innerHTML, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'b', 'em', 'i', 's', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'input', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img', 'hr'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'type', 'checked', 'start'],
    ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
  });
  container.innerHTML = clean;
  container.querySelectorAll('img').forEach(img => { if (!img.hasAttribute('src')) img.remove(); });
  // Translate conventional HTML checkboxes to TipTap task-list parse rules.
  container.querySelectorAll('input').forEach(input => {
    if (input.type === 'checkbox' && input.closest('li')) {
      const li = input.closest('li')!;
      li.setAttribute('data-type', 'taskItem');
      li.setAttribute('data-checked', String(input.hasAttribute('checked')));
      li.parentElement?.setAttribute('data-type', 'taskList');
      if (input.nextSibling?.nodeType === Node.TEXT_NODE) input.nextSibling.textContent = input.nextSibling.textContent?.replace(/^\s+/, '') ?? '';
    }
    input.remove();
  });
  return container.innerHTML;
}

export function extractEmbeddedImages(html: string): Blob[] {
  const images: Blob[] = [];
  for (const img of pasteDocument(html).querySelectorAll('img[src]')) {
    const match = /^data:(image\/[\w.+-]+)(;base64)?,([\s\S]*)$/i.exec(img.getAttribute('src') ?? '');
    if (!match) continue;
    try {
      const binary = match[2] ? atob(match[3].replace(/\s/g, '')) : decodeURIComponent(match[3]);
      images.push(new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: match[1].toLowerCase() }));
    } catch { /* Malformed embedded data is dropped, like unsupported sources. */ }
  }
  return images;
}

const pasteMarkdown = new Marked();
const looksLikeMarkdown = /^(?: {0,3}#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|\s*```|\s*~~~|\s*\|.+\|)/m;

/** Shared by the editor and its clipboard integration tests. */
export function noteClipboardProps(getEditor: () => Editor | null): EditorProps {
  let plainPaste = false;
  return {
    transformPastedHTML: cleanPastedHtml,
    handleDOMEvents: {
      keyup: () => { plainPaste = false; return false; },
      blur: () => { plainPaste = false; return false; },
    },
    handleKeyDown: (_view, event) => {
      plainPaste = event.key.toLowerCase() === 'v' && event.shiftKey && (event.ctrlKey || event.metaKey);
      return false;
    },
    clipboardTextSerializer: (slice) => getEditor()?.markdown?.serialize({ type: 'doc', content: slice.content.toJSON() }) ?? '',
    handlePaste: (view, event) => {
      const plain = plainPaste; plainPaste = false;
      const editor = getEditor();
      const data = event.clipboardData;
      if (!editor || !data) return false;
      const html = data.getData('text/html');
      const text = data.getData('text/plain');
      if (plain || editor.isActive('codeBlock')) {
        if (!text) return false;
        event.preventDefault();
        view.dispatch(view.state.tr.insertText(text).scrollIntoView());
        return true;
      }
      const sourceHtml = html || (looksLikeMarkdown.test(text) ? pasteMarkdown.parse(text, { async: false }) : '');
      if (sourceHtml) {
        event.preventDefault();
        const clean = cleanPastedHtml(sourceHtml);
        if (clean) editor.commands.insertContent(clean);
        const files = extractEmbeddedImages(sourceHtml).map((blob, index) => new File([blob], `Pasted picture ${index + 1}`, { type: blob.type }));
        if (files.length) void insertPictureFiles(editor, files);
        return true;
      }
      if (text) return false;
      const files = Array.from(data.files).filter(file => file.type.startsWith('image/'));
      if (!files.length) return false;
      event.preventDefault();
      void insertPictureFiles(editor, files);
      return true;
    },
  };
}
