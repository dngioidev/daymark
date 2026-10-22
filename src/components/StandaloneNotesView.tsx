import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bold,
  CheckSquare,
  Code,
  Columns,
  Edit2,
  Eye,
  FilePlus,
  FolderPlus,
  Heading2,
  Italic,
  ListChecks,
  MoreHorizontal,
  Pin,
  Search,
  Trash2,
} from 'lucide-react';
import { StandaloneNote } from '../types/daymark';
import { MarkdownPreview } from './MarkdownPreview';
import { Menu } from './ui/Menu';
import { buttonClass } from './ui/Dialog';
import { confirmDialog, showToast } from './ui/feedback';
import { useBackHandler } from '../native/backButton';
import { formatNoteDate, noteChecklist, notePreview, sortNotes } from '../utils/notes';

interface StandaloneNotesViewProps {
  notes: StandaloneNote[];
  onUpdateNotes: (notes: StandaloneNote[]) => void;
  /** Phone shell: one pane at a time, no outer page padding. */
  compact?: boolean;
}

type ViewMode = 'edit' | 'split' | 'preview';

/** Notes: searchable list (pinned first) and a Markdown editor with preview. */
export const StandaloneNotesView: React.FC<StandaloneNotesViewProps> = ({ notes, onUpdateNotes, compact = false }) => {
  const sorted = useMemo(() => sortNotes(notes), [notes]);
  const [selectedNoteId, setSelectedNoteId] = useState<string>(sorted[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>(compact ? 'preview' : 'split');
  const [newFolderInput, setNewFolderInput] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [pane, setPane] = useState<'list' | 'editor'>('list');
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const focusTitle = useRef(false);

  // Android Back: editor -> list
  useBackHandler(() => (setPane('list'), true), pane === 'editor');

  const allFolders = useMemo(() => [...new Set(notes.map((n) => n.folder).filter(Boolean))].sort(), [notes]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return sorted.filter(
      (n) =>
        (selectedFolder === 'all' || n.folder === selectedFolder) &&
        (!q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }, [sorted, selectedFolder, searchQuery]);

  const activeNote = notes.find((n) => n.id === selectedNoteId) || filteredNotes[0] || null;

  useEffect(() => {
    if (focusTitle.current && titleRef.current) {
      focusTitle.current = false;
      titleRef.current.focus();
      titleRef.current.select();
    }
  });

  const updateActive = (updates: Partial<StandaloneNote>) => {
    if (!activeNote) return;
    onUpdateNotes(notes.map((n) => (n.id === activeNote.id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n)));
  };

  const createNote = (folder = selectedFolder === 'all' ? allFolders[0] || 'General' : selectedFolder, title = 'Untitled') => {
    const now = new Date().toISOString();
    const note: StandaloneNote = { id: `note-${Date.now()}`, title, folder, content: '', tags: [], createdAt: now, updatedAt: now, pinned: false };
    onUpdateNotes([note, ...notes]);
    setSelectedNoteId(note.id);
    setViewMode(compact ? 'edit' : 'split');
    setPane('editor');
    focusTitle.current = true;
    return note;
  };

  const deleteNote = async (note: StandaloneNote) => {
    const ok = await confirmDialog({ title: 'Delete this note?', message: <>“{note.title}” will be deleted.</>, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    const before = notes;
    const remaining = notes.filter((n) => n.id !== note.id);
    onUpdateNotes(remaining);
    setSelectedNoteId(sortNotes(remaining)[0]?.id || '');
    setPane('list');
    showToast(`Deleted “${note.title}”`, { action: { label: 'Undo', onClick: () => onUpdateNotes(before) } });
  };

  const createFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFolderInput.trim();
    if (!name) return;
    createNote(name, `${name} overview`);
    setSelectedFolder(name);
    setNewFolderInput('');
    setShowNewFolder(false);
  };

  const openLinkedNote = (noteTitle: string) => {
    const target = notes.find((n) => n.title.toLowerCase().trim() === noteTitle.toLowerCase().trim());
    if (target) {
      setSelectedNoteId(target.id);
      setSelectedFolder('all');
      setPane('editor');
    } else createNote(activeNote?.folder || 'General', noteTitle);
  };

  // Wraps the selection (or a placeholder) and keeps it selected
  const format = (before: string, after = '', placeholder = 'text') => {
    if (!activeNote) return;
    const el = editorRef.current;
    const start = el?.selectionStart ?? activeNote.content.length;
    const end = el?.selectionEnd ?? activeNote.content.length;
    const selected = activeNote.content.slice(start, end) || placeholder;
    updateActive({ content: activeNote.content.slice(0, start) + before + selected + after + activeNote.content.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const toggleCheckbox = (index: number, checked: boolean) => {
    if (!activeNote) return;
    let count = 0;
    updateActive({
      content: activeNote.content.replace(/([-*]\s*\[)([ xX])(\])/g, (m, p, _c, s) => (count++ === index ? `${p}${checked ? 'x' : ' '}${s}` : m)),
    });
  };

  const iconBtn =
    'inline-flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800';
  const chip = (active: boolean) =>
    `min-h-11 sm:min-h-8 px-3 rounded-full text-sm font-medium whitespace-nowrap ${
      active ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
    }`;
  const seg = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-2.5 min-h-11 sm:min-h-9 rounded-md text-sm ${
      active ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-semibold shadow-2xs' : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
    }`;

  const list = (
    <div className={`flex flex-col min-h-0 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden ${pane === 'editor' ? 'hidden lg:flex' : 'flex'}`}>
      <div className="p-3 space-y-2 border-b border-stone-200 dark:border-stone-800">
        <div className="relative">
          <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <label htmlFor="notes-search" className="sr-only">
            Search notes
          </label>
          <input
            id="notes-search"
            type="search"
            placeholder="Search notes"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 min-h-11 sm:min-h-9 text-[15px] sm:text-sm bg-stone-50 dark:bg-stone-800/80 border border-stone-300 dark:border-stone-700 rounded-lg placeholder:text-stone-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Folders">
          <button type="button" aria-pressed={selectedFolder === 'all'} onClick={() => setSelectedFolder('all')} className={chip(selectedFolder === 'all')}>
            All ({notes.length})
          </button>
          {allFolders.map((f) => (
            <button key={f} type="button" aria-pressed={selectedFolder === f} onClick={() => setSelectedFolder(f)} className={chip(selectedFolder === f)}>
              {f}
            </button>
          ))}
        </div>
        {showNewFolder && (
          <form onSubmit={createFolder} className="flex gap-2">
            <label htmlFor="new-folder" className="sr-only">
              Folder name
            </label>
            <input
              id="new-folder"
              type="text"
              placeholder="Folder name"
              value={newFolderInput}
              onChange={(e) => setNewFolderInput(e.target.value)}
              className="flex-1 min-w-0 px-3 min-h-11 sm:min-h-9 text-[15px] sm:text-sm bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg"
              autoFocus
            />
            <button type="submit" disabled={!newFolderInput.trim()} className={buttonClass.secondary}>
              Create
            </button>
          </form>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
        {filteredNotes.length > 0 ? (
          filteredNotes.map((note) => {
            const isSelected = note.id === activeNote?.id && !compact;
            const checklist = noteChecklist(note.content);
            const preview = notePreview(note.content.replace(new RegExp(`^#\\s+${note.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`), ''));
            return (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNoteId(note.id);
                    setPane('editor');
                  }}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`w-full text-left px-3 py-2.5 ${
                    isSelected ? 'bg-accent text-accent-fg' : 'hover:bg-stone-50 dark:hover:bg-stone-800/40'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`flex-1 min-w-0 font-semibold text-[15px] sm:text-sm truncate ${isSelected ? '' : 'text-stone-900 dark:text-stone-100'}`}>{note.title || 'Untitled'}</span>
                    {note.pinned && <Pin className={`w-4 h-4 shrink-0 ${isSelected ? '' : 'text-amber-700 dark:text-amber-400'}`} role="img" aria-label="Pinned" />}
                  </div>
                  <div className={`mt-0.5 flex items-center gap-2 text-xs ${isSelected ? '' : 'text-stone-600 dark:text-stone-400'}`}>
                    <span className="font-medium">{note.folder}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatNoteDate(note.updatedAt)}</span>
                    {checklist && (
                      <span className="inline-flex items-center gap-1">
                        <ListChecks className="w-3.5 h-3.5" /> {checklist.done}/{checklist.total}
                      </span>
                    )}
                  </div>
                  {preview && <p className={`mt-1 text-sm line-clamp-2 ${isSelected ? '' : 'text-stone-600 dark:text-stone-400'}`}>{preview}</p>}
                </button>
              </li>
            );
          })
        ) : (
          <li className="p-8 text-center text-stone-600 dark:text-stone-400">
            {notes.length === 0 ? 'No notes yet. Tap New note to write one.' : 'No notes match your search.'}
          </li>
        )}
      </ul>
    </div>
  );

  const editor = (
    <div className={`flex flex-col min-h-0 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden ${pane === 'list' ? 'hidden lg:flex' : 'flex'}`}>
      {activeNote ? (
        <>
          <div className="px-2 sm:px-3 py-2 border-b border-stone-200 dark:border-stone-800 space-y-1">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPane('list')} aria-label="Back to notes" className={`${iconBtn} lg:hidden`}>
                <ArrowLeft className="w-5 h-5" />
              </button>
              <label htmlFor="note-title" className="sr-only">
                Title
              </label>
              <input
                id="note-title"
                ref={titleRef}
                type="text"
                value={activeNote.title}
                onChange={(e) => updateActive({ title: e.target.value })}
                placeholder="Title"
                enterKeyHint="next"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setViewMode((m) => (m === 'preview' ? 'edit' : m));
                    requestAnimationFrame(() => editorRef.current?.focus());
                  }
                }}
                className="flex-1 min-w-0 px-2 min-h-11 text-lg font-bold bg-transparent rounded-lg border border-transparent hover:border-stone-200 focus:border-stone-300 dark:hover:border-stone-700 focus:outline-hidden text-stone-900 dark:text-stone-50"
              />
              <button
                type="button"
                onClick={() => updateActive({ pinned: !activeNote.pinned })}
                aria-pressed={Boolean(activeNote.pinned)}
                aria-label={activeNote.pinned ? 'Unpin note' : 'Pin note to the top'}
                title={activeNote.pinned ? 'Unpin' : 'Pin to the top'}
                className={`${iconBtn} ${activeNote.pinned ? 'text-amber-700 dark:text-amber-400' : ''}`}
              >
                <Pin className={`w-4 h-4 ${activeNote.pinned ? 'fill-current' : ''}`} />
              </button>
              <Menu
                align="right"
                items={[{ label: 'Delete note', icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: () => deleteNote(activeNote) }]}
                trigger={(props) => (
                  <button type="button" {...props} aria-label="More note actions" className={iconBtn}>
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                )}
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 px-1">
              <label className="flex items-center gap-1.5 text-sm text-stone-600 dark:text-stone-400 mr-1">
                Folder
                <select
                  value={activeNote.folder}
                  onChange={(e) => updateActive({ folder: e.target.value })}
                  className="px-2 min-h-11 sm:min-h-9 text-sm bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100"
                >
                  {[...new Set([...allFolders, activeNote.folder])].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-0.5 p-0.5 bg-stone-100 dark:bg-stone-800 rounded-lg ml-auto" role="group" aria-label="View">
                <button type="button" aria-pressed={viewMode === 'edit'} onClick={() => setViewMode('edit')} className={seg(viewMode === 'edit')}>
                  <Edit2 className="w-4 h-4" /> Edit
                </button>
                {!compact && (
                  <button type="button" aria-pressed={viewMode === 'split'} onClick={() => setViewMode('split')} className={`${seg(viewMode === 'split')} hidden md:inline-flex`}>
                    <Columns className="w-4 h-4" /> Split
                  </button>
                )}
                <button type="button" aria-pressed={viewMode === 'preview'} onClick={() => setViewMode('preview')} className={seg(viewMode === 'preview')}>
                  <Eye className="w-4 h-4" /> Read
                </button>
              </div>
            </div>

            {viewMode !== 'preview' && (
              <div className="flex items-center gap-0.5 overflow-x-auto" role="toolbar" aria-label="Formatting">
                {(
                  [
                    ['Heading', <Heading2 className="w-4 h-4" />, '## ', '', 'Heading'],
                    ['Bold', <Bold className="w-4 h-4" />, '**', '**', 'bold text'],
                    ['Italic', <Italic className="w-4 h-4" />, '*', '*', 'italic text'],
                    ['Checklist item', <CheckSquare className="w-4 h-4" />, '- [ ] ', '', 'to do'],
                    ['Code', <Code className="w-4 h-4" />, '`', '`', 'code'],
                  ] as const
                ).map(([label, icon, before, after, ph]) => (
                  <button
                    key={label}
                    type="button"
                    aria-label={label}
                    title={label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => format(before, after, ph)}
                    className={iconBtn}
                  >
                    {icon}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Link to another note"
                  title="Link to another note"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => format('[[', ']]', 'Note title')}
                  className={`${iconBtn} w-auto sm:w-auto px-2 text-sm font-semibold`}
                >
                  [[ ]]
                </button>
              </div>
            )}
          </div>

          <div className={`flex-1 min-h-0 ${viewMode === 'split' ? 'grid grid-cols-1 md:grid-cols-2 divide-x divide-stone-200 dark:divide-stone-800' : 'flex flex-col'}`}>
            {viewMode !== 'preview' && (
              <>
                <label htmlFor="note-editor-textarea" className="sr-only">
                  Note text (Markdown)
                </label>
                <textarea
                  id="note-editor-textarea"
                  ref={editorRef}
                  value={activeNote.content}
                  onChange={(e) => updateActive({ content: e.target.value })}
                  className={`w-full flex-1 p-4 sm:p-5 text-[15px] sm:text-sm leading-relaxed bg-transparent border-0 focus:outline-hidden text-stone-900 dark:text-stone-100 resize-none placeholder:text-stone-500 ${compact ? 'min-h-[60dvh]' : ''}`}
                  placeholder="Start writing… Markdown works: # heading, - [ ] checklist, **bold**"
                />
              </>
            )}
            {viewMode !== 'edit' && (
              <div className="p-4 sm:p-6 overflow-y-auto flex-1" tabIndex={0} role="region" aria-label="Note preview">
                {activeNote.content.trim() ? (
                  <MarkdownPreview content={activeNote.content} onInternalLinkClick={openLinkedNote} onToggleTaskItem={toggleCheckbox} />
                ) : (
                  <p className="text-stone-600 dark:text-stone-400">This note is empty. Tap Edit to write.</p>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-stone-600 dark:text-stone-400">
          <p>Select a note, or start a new one.</p>
          <button type="button" onClick={() => createNote()} className={buttonClass.primary}>
            <FilePlus className="w-4 h-4" /> New note
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={
        compact
          ? 'flex flex-col gap-3 text-sm'
          : 'w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4 h-[calc(100dvh-3.5rem)] flex flex-col gap-3 text-sm'
      }
    >
      {(pane === 'list' || !compact) && (
        <div className={`flex items-center gap-2 ${pane === 'editor' ? 'hidden lg:flex' : ''}`}>
          <h1 className="text-xl font-bold text-[var(--dm-page-fg)] mr-auto">Notes</h1>
          <button type="button" onClick={() => setShowNewFolder(!showNewFolder)} className={buttonClass.ghost}>
            <FolderPlus className="w-4 h-4" /> <span className="hidden sm:inline">New folder</span>
            <span className="sm:hidden">Folder</span>
          </button>
          <button type="button" onClick={() => createNote()} className={buttonClass.primary}>
            <FilePlus className="w-4 h-4" /> New note
          </button>
        </div>
      )}

      {compact ? (
        pane === 'list' ? list : editor
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 xl:col-span-3 min-h-0 flex flex-col">{list}</div>
          <div className="lg:col-span-8 xl:col-span-9 min-h-0 flex flex-col">{editor}</div>
        </div>
      )}
    </div>
  );
};
