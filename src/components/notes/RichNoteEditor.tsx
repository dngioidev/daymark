import React, { useEffect, useRef, useImperativeHandle, useMemo } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { noteClipboardProps } from './clipboard';
import type { StandaloneNote } from '../../types/daymark';
import { editorExtensions } from './editorExtensions';
import { EditorToolbar } from './EditorToolbar';
import { insertPictureFiles } from './pictureNode';
import type { Editor } from '@tiptap/core';
import './richNoteEditor.css';

export interface RichNoteEditorProps {
  noteId: string;
  markdown: string;
  onChange(markdown: string): void;
  onOpenLink(title: string): void;
  notes: Pick<StandaloneNote, 'id' | 'title'>[];
  onCreateNote(title: string): string;
  onToggleMarkdown?(): void;
  ref?: React.Ref<RichNoteEditorHandle>;
}

export interface RichNoteEditorHandle { focus(): void }

export default function RichNoteEditor({ noteId, markdown, onChange, onOpenLink, onToggleMarkdown, ref }: RichNoteEditorProps) {
  const latestOnChange = useRef(onChange);
  latestOnChange.current = onChange;
  const latestOpenLink = useRef(onOpenLink);
  latestOpenLink.current = onOpenLink;
  const original = useRef(markdown);
  const activeEditor = useRef<Editor | null>(null);
  const clipboard = useMemo(() => noteClipboardProps(() => activeEditor.current), [noteId]);
  const editor = useEditor({
    extensions: editorExtensions,
    content: markdown,
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': 'Note rich text', 'aria-multiline': 'true', class: 'dm-note-prose min-h-full p-4 sm:p-5 outline-none text-stone-900 dark:text-stone-100' },
      ...clipboard,
      handleDrop: (view, event, _slice, moved) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter(file => file.type.startsWith('image/'));
        if (moved || !files.length || !activeEditor.current) return false;
        event.preventDefault();
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertPictureFiles(activeEditor.current, files, position);
        return true;
      },
      handleDOMEvents: {
        ...clipboard.handleDOMEvents,
        click: (_view, event) => {
          const link = (event.target as Element).closest<HTMLElement>('[data-wiki-title]');
          if (!link?.dataset.wikiTitle) return false;
          latestOpenLink.current(link.dataset.wikiTitle);
          return true;
        },
      },
    },
    onUpdate: ({ editor, transaction }) => {
      if (!transaction.docChanged || transaction.getMeta('preventUpdate')) return;
      const next = editor.getMarkdown();
      original.current = next;
      latestOnChange.current(next);
    },
  }, [noteId]);
  activeEditor.current = editor;
  // Subscribe to selection and transactions so toolbar state follows shortcuts.
  useEditorState({ editor, selector: ({ transactionNumber }) => transactionNumber });
  useImperativeHandle(ref, () => ({ focus: () => { editor?.commands.focus(); } }), [editor]);
  useEffect(() => {
    if (!editor || markdown === original.current) return;
    original.current = markdown;
    editor.chain().setContent(markdown, { contentType: 'markdown', emitUpdate: false })
      .command(({ tr }) => { tr.setMeta('addToHistory', false); return true; }).run();
  }, [editor, markdown]);
  if (!editor) return <div className="p-4 text-stone-600 dark:text-stone-300" role="status">Loading editor…</div>;
  return <div className="flex flex-1 min-h-0 min-w-0 flex-col">
    <EditorToolbar editor={editor} onToggleMarkdown={onToggleMarkdown} />
    <div className="min-h-0 min-w-0 flex-1 overflow-auto pb-16 md:pb-0"><EditorContent editor={editor} className="h-full min-w-0" /></div>
  </div>;
}
