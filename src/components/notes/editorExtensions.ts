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
import { Extension, type JSONContent } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Temporary text decorations keep existing wiki-link clicks working without
// introducing the wiki node/autocomplete assigned to Task 7.
const WikiTextLinks = Extension.create({
  name: 'wikiTextLinks',
  addProseMirrorPlugins: () => [new Plugin({ props: {
    decorations(state) {
      const decorations: Decoration[] = [];
      state.doc.descendants((node, position) => {
        if (node.type.name === 'codeBlock') return false;
        if (!node.isText || !node.text || node.marks.some((mark) => mark.type.name === 'code')) return;
        for (const match of node.text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
          decorations.push(Decoration.inline(position + match.index, position + match.index + match[0].length, {
            'data-wiki-title': match[1].split('|')[0], class: 'cursor-pointer underline',
          }));
        }
      });
      return DecorationSet.create(state.doc, decorations);
    },
  } })],
});

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
            const visit = (node: JSONContent): JSONContent => node.type === 'rawInline'
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
  WikiTextLinks,
  NoteMarkdown.configure({ marked: createNoteLexer() }),
];
