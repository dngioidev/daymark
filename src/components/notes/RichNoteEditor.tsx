import React, { useEffect, useRef } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import DOMPurify from 'dompurify';
import type { StandaloneNote } from '../../types/daymark';
import { editorExtensions } from './editorExtensions';
import { EditorToolbar } from './EditorToolbar';
import './richNoteEditor.css';

export interface RichNoteEditorProps {
  noteId: string;
  markdown: string;
  onChange(markdown: string): void;
  onOpenLink(title: string): void;
  notes: Pick<StandaloneNote, 'id' | 'title'>[];
  onCreateNote(title: string): string;
}

export default function RichNoteEditor({ noteId, markdown, onChange }: RichNoteEditorProps) {
  const latestOnChange = useRef(onChange);
  latestOnChange.current = onChange;
  const original = useRef(markdown);
  const editor = useEditor({
    extensions: editorExtensions,
    content: markdown,
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': 'Note rich text', 'aria-multiline': 'true', class: 'dm-note-prose min-h-full p-4 sm:p-5 outline-none text-stone-900 dark:text-stone-100' },
      transformPastedHTML: (html) => DOMPurify.sanitize(html),
    },
    onUpdate: ({ editor, transaction }) => {
      if (!transaction.docChanged || transaction.getMeta('preventUpdate')) return;
      const next = editor.getMarkdown();
      original.current = next;
      latestOnChange.current(next);
    },
  }, [noteId]);
  // Subscribe to selection and transactions so toolbar state follows shortcuts.
  useEditorState({ editor, selector: ({ transactionNumber }) => transactionNumber });
  useEffect(() => {
    if (!editor || markdown === original.current) return;
    original.current = markdown;
    editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
  }, [editor, markdown]);
  if (!editor) return <div className="p-4 text-stone-600 dark:text-stone-300" role="status">Loading editor…</div>;
  return <div className="flex flex-1 min-h-0 flex-col">
    <EditorToolbar editor={editor} />
    <div className="min-h-0 flex-1 overflow-auto pb-16 md:pb-0"><EditorContent editor={editor} className="h-full" /></div>
  </div>;
}
