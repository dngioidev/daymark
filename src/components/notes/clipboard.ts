import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import type { Editor } from '@tiptap/core';
import type { EditorProps } from '@tiptap/pm/view';
import { insertPictureFiles, isPictureSource } from './pictureNode';

// One isolated instance: never change the hooks used by previews or Mermaid.
const pasteSanitizer = DOMPurify(window);
pasteSanitizer.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'src') {
    // Embedded images survive the first sanitization for extraction in an inert
    // document. They are removed before any HTML is handed to the editor.
    data.keepAttr = node.nodeName === 'IMG' && (isPictureSource(data.attrValue) || /^data:image\//i.test(data.attrValue));
    data.forceKeepAttr = data.keepAttr;
  }
  if (data.attrName === 'type') data.keepAttr = node.nodeName === 'INPUT' && data.attrValue === 'checkbox';
});

function sanitizeRawHtml(html: string): string {
  // This MUST precede our DOM creation/parsing, even for image extraction.
  // Preserve only the intermediate markup needed to identify code and math.
  return pasteSanitizer.sanitize(html, {
    RETURN_DOM: false, RETURN_DOM_FRAGMENT: false,
    ADD_TAGS: ['code-block', 'annotation'], ADD_ATTR: ['encoding'],
    FORBID_TAGS: ['script', 'style'], FORBID_ATTR: ['srcset'],
  });
}

function pasteDocument(sanitizedHtml: string): HTMLElement {
  // Never adopt clipboard nodes into the live document, even after sanitizing.
  const inertDocument = document.implementation.createHTMLDocument('');
  const container = inertDocument.body;
  container.innerHTML = sanitizedHtml;
  container.querySelectorAll('nav, aside, footer, [role="navigation"], [role="banner"], [role="contentinfo"], [class~="advertisement"], [class~="ads"], [class~="ad"], [id="ad"]').forEach(node => node.remove());
  return container;
}

const internalSlice = /\bdata-pm-slice\s*=/i;
const languageAliases: Record<string, string> = {
  python: 'python', py: 'python', javascript: 'javascript', js: 'javascript',
  typescript: 'typescript', ts: 'typescript', shell: 'bash', bash: 'bash', sh: 'bash',
  html: 'html', css: 'css', json: 'json', java: 'java', sql: 'sql',
  yaml: 'yaml', yml: 'yaml', markdown: 'markdown', mermaid: 'mermaid',
  'c++': 'cpp', 'c#': 'csharp', ruby: 'ruby', rust: 'rust', go: 'go',
  kotlin: 'kotlin', swift: 'swift', php: 'php', text: 'text', plaintext: 'text',
};

function cleanCodeBlocks(container: HTMLElement): void {
  for (const pre of container.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    if (!code) continue;
    let wrapper: Element = pre;
    for (let ancestor = pre.parentElement; ancestor && ancestor !== container; ancestor = ancestor.parentElement) {
      if (ancestor.tagName.includes('-') || /(?:^|\s)code-(?:block|panel)(?:[\s_-]|$)/.test(ancestor.className)) {
        wrapper = ancestor;
        break;
      }
    }
    const headers = Array.from(wrapper.querySelectorAll('div, header')).filter(element => {
      if (element.contains(code) || code.contains(element)) return false;
      return element.matches('[class*="decoration"], [class*="header"], [class*="toolbar"]')
        || Boolean(element.querySelector('button, [role="button"]'));
    });
    let language = code.className.match(/(?:^|\s)language-([\w+-]+)(?=\s|$)/)?.[1];
    if (!language) {
      for (const header of headers) {
        for (const label of header.querySelectorAll('span')) {
          if (label.closest('button, [role="button"]')) continue;
          language = languageAliases[label.textContent?.trim().toLowerCase() ?? ''];
          if (language) break;
        }
        if (language) break;
      }
    }
    headers.forEach(header => header.remove());
    code.textContent = code.textContent?.replace(/\n$/, '') ?? '';
    code.className = language ? `language-${language}` : '';
    pre.replaceChildren(code);
  }
}

export function cleanPastedHtml(html: string): string {
  const sanitized = sanitizeRawHtml(html);
  // Keep Daymark/ProseMirror's node attributes and slice context intact. The
  // schema, rather than external-content normalization, owns internal pastes.
  if (internalSlice.test(sanitized)) return sanitized;
  const container = pasteDocument(sanitized);
  const inertDocument = container.ownerDocument;
  container.querySelectorAll('span.katex').forEach(katex => {
    const annotation = katex.querySelector('annotation[encoding="application/x-tex"]');
    if (!annotation) return;
    const display = katex.closest('.katex-display');
    const source = `${display ? '$$' : '$'}${annotation.textContent ?? ''}${display ? '$$' : '$'}`;
    if (display) {
      const paragraph = inertDocument.createElement('p'); paragraph.textContent = source; display.replaceWith(paragraph);
    } else katex.replaceWith(inertDocument.createTextNode(source));
  });
  container.querySelectorAll('.katex-html, .katex-mathml').forEach(node => node.remove());
  cleanCodeBlocks(container);
  container.querySelectorAll('button, [role="button"]').forEach(node => node.remove());
  // Retain div line boundaries before unwrapping generic layout containers.
  container.querySelectorAll('div').forEach(div => {
    if (!div.closest('pre') && div.childNodes.length && !div.querySelector('p, div, h1, h2, h3, h4, h5, h6, ul, ol, pre, table, blockquote')) {
      const p = inertDocument.createElement('p'); p.append(...div.childNodes); div.replaceWith(p);
    }
  });
  container.querySelectorAll('[class]').forEach(element => {
    const language = element.tagName === 'CODE' ? element.className.match(/(?:^|\s)(language-[\w+-]+)(?=\s|$)/)?.[1] : undefined;
    if (language) element.setAttribute('class', language); else element.removeAttribute('class');
  });
  container.querySelectorAll('img').forEach(img => { if (!isPictureSource(img.getAttribute('src') ?? '')) img.remove(); });
  container.innerHTML = pasteSanitizer.sanitize(container.innerHTML, {
    RETURN_DOM: false, RETURN_DOM_FRAGMENT: false,
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'b', 'em', 'i', 's', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'input', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img', 'hr'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'type', 'checked', 'start'],
    ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
  });
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
  const sanitized = sanitizeRawHtml(html);
  const images: Blob[] = [];
  for (const img of pasteDocument(sanitized).querySelectorAll('img[src]')) {
    const match = /^data:(image\/[\w.+-]+)(;base64)?,([\s\S]*)$/i.exec(img.getAttribute('src') ?? '');
    if (!match) continue;
    try {
      const binary = match[2] ? atob(match[3].replace(/\s/g, '')) : decodeURIComponent(match[3]);
      images.push(new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: match[1].toLowerCase() }));
    } catch { /* Malformed embedded data is dropped, like unsupported sources. */ }
  }
  return images;
}

const pasteMarkdown = new Marked({ breaks: true });
function looksLikeMarkdown(text: string): boolean {
  if (/^ {0,3}(?:`{3,}|~{3,})/m.test(text) || /^\s*\|.+\|/m.test(text)) return true;
  const signals = text.match(/^(?: {0,3}#{1,6}\s|[ \t]*[-*+]\s|[ \t]*\d+[.)]\s)/gm);
  return (signals?.length ?? 0) >= 2;
}

/** Clipboard behavior shared by each rich editor instance. */
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
      if (internalSlice.test(html)) return false;
      const sourceHtml = html || (looksLikeMarkdown(text) ? pasteMarkdown.parse(text, { async: false }) : '');
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
