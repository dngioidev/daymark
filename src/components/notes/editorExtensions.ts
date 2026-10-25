import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown, type MarkdownExtensionOptions } from '@tiptap/markdown';
import { Marked } from 'marked';
import { RawMarkdown, RawHtml } from './rawMarkdownNode';

// TipTap's default paragraph parser unwraps lone images as block nodes.
// Keep images inline so mixed text/image paragraphs also satisfy the schema.
const NoteStarterKit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) => extension.name === 'paragraph' ? extension.extend({
      parseMarkdown(token, helpers) {
        if (token.tokens?.length === 1 && token.tokens[0].type === 'image') {
          return helpers.createNode('paragraph', undefined, helpers.parseInline(token.tokens));
        }
        return this.parent?.(token, helpers) ?? [];
      },
    }) : extension);
  },
});

// Daymark and TipTap resolve different marked versions. Their runtime lexer API
// is compatible; the package's private nominal types require this boundary cast.
export const createNoteLexer = () => new Marked() as unknown as NonNullable<MarkdownExtensionOptions['marked']>;

export const editorExtensions = [
  NoteStarterKit.configure({ link: { openOnClick: false }, heading: { levels: [1, 2, 3, 4, 5, 6] } }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
  Image.configure({ inline: true }),
  Placeholder.configure({ placeholder: 'Write…' }),
  RawMarkdown, RawHtml,
  Markdown.configure({ marked: createNoteLexer() }),
];
