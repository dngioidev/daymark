import { Extension, Node } from '@tiptap/core';

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
    start: (src) => src.search(/^(?:---[ \t]*$|[^\n]*\[\^[^\]\n]+\]| {0,3}`{3,}| {0,3}~{3,})/m),
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
