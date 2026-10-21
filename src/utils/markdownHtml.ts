import { marked } from 'marked';
import DOMPurify from 'dompurify';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders a Markdown body (frontmatter already removed) to sanitised HTML:
 * Daymark callouts, [[internal links]] and task checkboxes, then DOMPurify.
 * `interactive` enables the task checkboxes (otherwise they are disabled).
 */
export function renderMarkdownHtml(body: string, interactive: boolean): string {
  if (!body || !body.trim()) return '';

  let text = body;

  // Clean Daymark HTML machine comments from rendered output
  text = text.replace(/<!--\s*daymark:[\s\S]*?-->/gi, '');

  // Support Obsidian-style callouts:
  // > [!NOTE] text -> custom callout
  // > [!TIP] text
  // > [!WARNING] text
  // > [!CAUTION] text
  text = text.replace(
    /^>\s*\[!(NOTE|INFO|TIP|WARNING|CAUTION|IMPORTANT|ALERT)\]([^\n]*)\n((?:^>[^\n]*\n?)*)/gim,
    (_match, type: string, title: string, calloutText: string) => {
      const cleanType = type.toUpperCase();
      const calloutTitle = escapeHtml(
        title.trim() || cleanType.charAt(0) + cleanType.slice(1).toLowerCase()
      );
      const calloutBody = calloutText.replace(/^>\s?/gm, '');
      return `<div class="daymark-callout daymark-callout-${cleanType.toLowerCase()}"><div class="daymark-callout-header"><span class="daymark-callout-title">${calloutTitle}</span></div><div class="daymark-callout-content">${calloutBody}</div></div>\n`;
    }
  );

  // Support [[Internal Note Links]]
  text = text.replace(/\[\[(.*?)\]\]/g, (_match, noteTitle: string) => {
    const trimmed = noteTitle.trim();
    return `<button type="button" data-internal-note="${encodeURIComponent(
      trimmed
    )}" class="daymark-internal-link inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 underline decoration-amber-400/60 decoration-1 underline-offset-2 px-1 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 transition-colors cursor-pointer"><span>📝</span><span>${escapeHtml(trimmed)}</span></button>`;
  });

  let html: string;
  try {
    const parsed = marked.parse(text, { breaks: true, gfm: true }) as string;

    // Add interactive attributes to checkboxes
    let taskIndex = 0;
    html = parsed.replace(/<input([^>]*?)type="checkbox"([^>]*?)>/gi, (match) => {
      const isChecked = match.includes('checked');
      const currentIdx = taskIndex++;
      return `<input type="checkbox"${isChecked ? ' checked' : ''} data-task-index="${currentIdx}" class="daymark-interactive-checkbox" ${
        interactive ? '' : 'disabled'
      } />`;
    });
  } catch (e) {
    console.error('Markdown parse error:', e);
    html = text;
  }

  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['data-internal-note', 'data-task-index'],
    // The narrow URI regexp is also applied to non-URI attributes, so list the ones marked emits.
    ADD_URI_SAFE_ATTR: ['type', 'start', 'align', 'colspan', 'rowspan'],
    FORBID_TAGS: ['style', 'form'],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):|^#|^\/(?!\/)/i,
  });
}
