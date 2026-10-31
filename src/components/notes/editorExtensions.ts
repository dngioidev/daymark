import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Callout } from './calloutNode';
import { Mermaid } from './mermaidNode';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Picture } from './pictureNode';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown, type MarkdownExtensionOptions } from '@tiptap/markdown';
import { Marked } from 'marked';
import { RawMarkdown, RawHtml, RawInline } from './rawMarkdownNode';
import { preserveNoteText } from '../../utils/noteTextSerialization';
import type { JSONContent } from '@tiptap/core';
import { WikiLink } from './wikiLink';
import Highlight from '@tiptap/extension-highlight';
import { HIGHLIGHTER_COLORS } from '../../ink/inkColors';

// Marked prepends tokenizers, so register after RawInline (lower priority) to
// own mark HTML. Leave == syntax and keyboard shortcuts unchanged.
const NoteHighlight = Highlight.extend({
  priority: 90,
  addInputRules: () => [],
  addPasteRules: () => [],
  addKeyboardShortcuts: () => ({}),
  renderMarkdown(node, helpers) {
    const color = /^#[\da-f]{6}$/i.test(node.attrs?.color ?? '') ? node.attrs!.color : HIGHLIGHTER_COLORS[0];
    return `<mark data-color="${color}" style="background-color: ${color}">${helpers.renderChildren(node)}</mark>`;
  },
  parseMarkdown(token, helpers) {
    // MarkdownManager applies marks to text only; keep our inline atoms marked
    // as well, just as NoteStarterKit does for ordinary text formatting.
    const visit = (node: JSONContent): JSONContent => ['rawInline', 'wikiLink', 'image'].includes(node.type ?? '')
      ? { ...node, marks: [...(node.marks ?? []), { type: 'highlight', attrs: { color: token.color } }] }
      : node.content ? { ...node, content: node.content.map(visit) } : node;
    return helpers.applyMark('highlight', helpers.parseInline(token.tokens ?? []).map(visit), { color: token.color });
  },
  markdownTokenizer: {
    name: 'highlight', level: 'inline',
    start: source => source.indexOf('<mark'),
    tokenize(source, _tokens, helpers) {
      const match = /^<mark\b([^>]*)>([\s\S]*?)<\/mark>/i.exec(source);
      if (!match) return undefined;
      const color = /\bdata-color=["'](#[\da-f]{6})["']/i.exec(match[1])?.[1]
        ?? /background-color:\s*(#[\da-f]{6})/i.exec(match[1])?.[1];
      if (!color) return undefined;
      return { type: 'highlight', raw: match[0], color, tokens: helpers.inlineTokens(match[2]) };
    },
  },
}).configure({ multicolor: true });

// TipTap's default paragraph parser unwraps lone images as block nodes.
// Keep images inline so mixed text/image paragraphs also satisfy the schema.
const NoteStarterKit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) => {
      if (['bold', 'italic', 'strike', 'link'].includes(extension.name)) return extension.extend({
        parseMarkdown(token, helpers) {
          const result = this.parent?.(token, helpers);
          if (result && !Array.isArray(result) && 'mark' in result) {
            const mark = { type: result.mark, ...(result.attrs ? { attrs: result.attrs } : {}) };
            const visit = (node: JSONContent): JSONContent => ['rawInline', 'wikiLink'].includes(node.type ?? '')
              ? { ...node, marks: [...(node.marks ?? []), mark] }
              : node.content ? { ...node, content: node.content.map(visit) } : node;
            return { ...result, content: (result.content ?? []).map(visit) };
          }
          return result ?? [];
        },
      });
      return extension.name === 'paragraph' ? extension.extend({
        parseMarkdown(token, helpers) {
          if (token.tokens?.length === 1 && token.tokens[0].type === 'image') {
            return helpers.createNode('paragraph', undefined, helpers.parseInline(token.tokens));
          }
          return this.parent?.(token, helpers) ?? [];
        },
      }) : extension;
    });
  },
});

// Daymark and TipTap resolve different marked versions. Their runtime lexer API
// is compatible; the package's private nominal types require this boundary cast.
export const createNoteLexer = () => new Marked() as unknown as NonNullable<MarkdownExtensionOptions['marked']>;

const NoteMarkdown = Markdown.extend({
  onBeforeCreate(event) {
    this.parent?.(event);
    if (this.editor.markdown) preserveNoteText(this.editor.markdown);
  },
});

export const editorExtensions = [
  NoteHighlight,
  NoteStarterKit.configure({ codeBlock: false, underline: false, link: { openOnClick: false }, heading: { levels: [1, 2, 3, 4, 5, 6] } }),
  CodeBlockLowlight.extend({
    renderHTML({ node, HTMLAttributes }) {
      return ['pre', { ...HTMLAttributes, 'data-language': node.attrs.language || 'Plain text', 'aria-label': `${node.attrs.language || 'Plain text'} code` }, ['code', node.attrs.language ? { class: `language-${node.attrs.language}` } : {}, 0]];
    },
    parseMarkdown(token, helpers) {
      if (token.lang === 'mermaid') return { type: 'mermaid', attrs: { source: token.text ?? '' } };
      return this.parent?.(token, helpers) ?? [];
    },
  }).configure({ lowlight: createLowlight(common), defaultLanguage: null }),
  Callout, Mermaid,
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false, renderWrapper: true }), TableRow, TableHeader, TableCell,
  Picture,
  Placeholder.configure({ placeholder: 'Write…' }),
  RawMarkdown, RawHtml, RawInline,
  WikiLink,
  NoteMarkdown.configure({ marked: createNoteLexer() }),
];
