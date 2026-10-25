import type { JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { editorExtensions, createNoteLexer } from '../components/notes/editorExtensions';
import { preserveNoteText } from './noteTextSerialization';

// Each manager owns its lexer; registering custom tokenizers must not mutate
// marked's global defaults (also used by MarkdownPreview).
const manager = preserveNoteText(new MarkdownManager({ marked: createNoteLexer(), extensions: editorExtensions }));

export const markdownToDoc = (markdown: string): JSONContent => manager.parse(markdown);
export const docToMarkdown = (doc: JSONContent): string => manager.serialize(doc);
