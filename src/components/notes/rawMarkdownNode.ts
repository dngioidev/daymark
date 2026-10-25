import { Extension, Node } from '@tiptap/core';
import { Lexer } from 'marked';

// Languages we can represent losslessly as ordinary code blocks. Unknown info
// strings (including fence options) stay raw until a later extension owns them.
const codeLanguages = new Set(['', 'text', 'txt', 'plaintext', 'javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx', 'json', 'css', 'html', 'xml', 'bash', 'sh', 'shell', 'python', 'py', 'sql', 'yaml', 'yml', 'markdown', 'md', 'java', 'c', 'cpp', 'csharp', 'cs', 'go', 'rust', 'ruby', 'php', 'kotlin', 'swift', 'mermaid']);

export const RawMarkdown = Node.create({
  name: 'rawMarkdown',
  group: 'block',
  atom: true,
  addAttributes: () => ({ source: { default: '' } }),
  parseHTML: () => [{ tag: 'pre[data-raw-markdown]', getAttrs: (element) => ({ source: element.textContent ?? '' }) }],
  renderHTML: ({ node }) => ['pre', { 'data-raw-markdown': '', class: 'whitespace-pre-wrap break-words rounded-lg bg-stone-100 p-3 font-mono text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-200', 'aria-label': 'Raw Markdown' }, ['code', {}, node.attrs.source]],
  parseMarkdown: (token) => ({ type: 'rawMarkdown', attrs: { source: token.text ?? '' } }),
  renderMarkdown: (node) => node.attrs?.source ?? '',
  markdownTokenizer: {
    name: 'rawMarkdown',
    level: 'block',
    // Marked asks start() about source.slice(1); index 0 is therefore not
    // necessarily a line boundary (e.g. the '-' after a leading backslash).
    // Initial blocks already get tokenize(); hints only target later lines.
    start: (src) => {
      const index = src.search(/\n(?=---[ \t]*(?:\n|$)|[^\n]*\[\^[^\]\n]+\]| {0,3}`{3,}| {0,3}~{3,})/);
      return index < 0 ? -1 : index + 1;
    },
    tokenize: (src) => {
      const frontmatter = src.match(/^---[ \t]*\n[\s\S]*?\n(?:---|\.\.\.)[ \t]*(?=\n|$)/);
      const footnote = src.match(/^\[\^[^\]]+\]:[^\n]*(?:\n(?:[ \t]+[^\n]*|(?=\n[ \t]+)\n[ \t]+[^\n]*))*/);
      const fence = src.match(/^ {0,3}(`{3,}|~{3,})([^\n]*)\n/);
      let source = frontmatter?.[0] ?? footnote?.[0];
      if (!source && fence && !codeLanguages.has(fence[2].trim())) {
        const closing = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*(?=\\n|$)`, 'm');
        const rest = src.slice(fence[0].length);
        const end = closing.exec(rest);
        source = end ? src.slice(0, fence[0].length + end.index + end[0].length) : src.replace(/\n+$/, '');
      }
      // Footnote references need their original brackets to remain linked to
      // the raw definition. Preserve their containing block rather than letting
      // the plain-text serializer backslash-escape the reference syntax.
      if (!source && !fence) {
        const block = src.match(/^[^\n]+(?:\n(?!\n)[^\n]+)*/)?.[0];
        if (block && /(?<!\\)\[\^[^\]\n]+\](?!:)/.test(block)) source = block;
      }
      if (!source) return undefined;
      return { type: 'rawMarkdown', raw: source, text: source };
    },
  },
});

export const RawHtml = Extension.create({
  name: 'rawHtml',
  priority: 1100,
  markdownTokenName: 'html',
  parseMarkdown: (token) => ({ type: 'rawMarkdown', attrs: { source: (token.raw ?? '').replace(/\n+$/, '') } }),
});

// An inline tokenizer runs before MarkdownManager's built-in HTML conversion,
// which would otherwise discard tags before extension parse handlers can run.
export const RawInline = Node.create({
  name: 'rawInline',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({ source: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-raw-inline]', getAttrs: (element) => ({ source: element.textContent ?? '' }) }],
  renderHTML: ({ node }) => ['span', { 'data-raw-inline': '', class: 'font-mono rounded bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200' }, node.attrs.source],
  parseMarkdown: (token) => ({ type: 'rawInline', attrs: { source: token.raw ?? '' } }),
  renderMarkdown: (node) => node.attrs?.source ?? '',
  markdownTokenizer: {
    name: 'rawInline', level: 'inline',
    start: (src) => src.search(/<|&(?:#\w+|[A-Za-z][A-Za-z\d]*);/),
    tokenize: (src) => {
      const raw = Lexer.rules.inline.normal.tag.exec(src)?.[0]
        ?? src.match(/^&(?:#[xX][\da-fA-F]+|#\d+|[A-Za-z][A-Za-z\d]*);/)?.[0];
      return raw ? { type: 'rawInline', raw } : undefined;
    },
  },
});
