import React, { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  FilePlus,
  FileCode,
  FolderPlus,
  ListChecks,
  Maximize2,
  MoreHorizontal,
  Pin,
  Search,
  Trash2,
} from 'lucide-react';
import { StandaloneNote } from '../types/daymark';
import { Menu } from './ui/Menu';
import { buttonClass } from './ui/Dialog';
import { confirmDialog, showToast } from './ui/feedback';
import { useBackHandler } from '../native/backButton';
import { formatNoteDate, noteChecklist, notePreview, sortNotes } from '../utils/notes';
import { NOTE_TEMPLATES, wordCount } from '../utils/noteTemplates';
import { formatLocalDate } from '../utils/clock';
import type { RichNoteEditorHandle } from './notes/RichNoteEditor';

const RichNoteEditor = React.lazy(() => import('./notes/RichNoteEditor'));

interface StandaloneNotesViewProps {
  notes: StandaloneNote[];
  onUpdateNotes: (notes: StandaloneNote[]) => void;
  /** Phone shell: one pane at a time, no outer page padding. */
  compact?: boolean;
  openNoteId?: string;
  onOpenNoteConsumed?: () => void;
  focusToggleSignal?: number;
}

type ViewMode = 'rich' | 'markdown';

/** Notes: searchable list (pinned first) and a rich editor backed by Markdown. */
export const StandaloneNotesView: React.FC<StandaloneNotesViewProps> = ({ notes, onUpdateNotes, compact = false, openNoteId, onOpenNoteConsumed, focusToggleSignal = 0 }) => {
  const sorted = useMemo(() => sortNotes(notes), [notes]);
  const [selectedNoteId, setSelectedNoteId] = useState<string>(sorted[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('rich');
  const [newFolderInput, setNewFolderInput] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [pane, setPane] = useState<'list' | 'editor'>('list');
  const [focusMode, setFocusMode] = useState(false);
  const [now, setNow] = useState(Date.now());
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const richEditorRef = useRef<RichNoteEditorHandle>(null);
  const focusTitle = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const previousFocusSignal = useRef(focusToggleSignal);
  useEffect(() => {
    if (previousFocusSignal.current === focusToggleSignal) return;
    previousFocusSignal.current = focusToggleSignal;
    if (compact) return;
    setFocusMode((focused) => !focused);
    setPane('editor');
  }, [focusToggleSignal, compact]);

  useEffect(() => {
    if (!openNoteId || !notes.some((note) => note.id === openNoteId)) return;
    setSelectedNoteId(openNoteId);
    setSelectedFolder('all');
    setSearchQuery('');
    setPane('editor');
    onOpenNoteConsumed?.();
  }, [openNoteId, notes, onOpenNoteConsumed]);

  useEffect(() => {
    if (compact) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (event.key === 'Escape' && focusMode && target?.tagName !== 'TEXTAREA') {
        setFocusMode(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [compact, focusMode]);

  // Android Back: editor -> list
  useBackHandler(() => (setFocusMode(false), setPane('list'), true), pane === 'editor');

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
  const editedMinutes = activeNote ? Math.max(0, Math.floor((now - new Date(activeNote.updatedAt).getTime()) / 60_000)) : 0;
  const editedLabel = editedMinutes < 1 ? 'just now' : editedMinutes < 60 ? `${editedMinutes} min ago` : activeNote ? formatNoteDate(activeNote.updatedAt) : '';
  const words = activeNote ? wordCount(activeNote.content) : 0;

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

  const createNote = (folder = selectedFolder === 'all' ? allFolders[0] || 'General' : selectedFolder, title = 'Untitled', content = '') => {
    const now = new Date().toISOString();
    const note: StandaloneNote = { id: `note-${Date.now()}`, title, folder, content, tags: [], createdAt: now, updatedAt: now, pinned: false };
    onUpdateNotes([note, ...notes]);
    setSelectedNoteId(note.id);
    setViewMode('rich');
    setPane('editor');
    focusTitle.current = true;
    return note;
  };

  const createFromTemplate = (template: (typeof NOTE_TEMPLATES)[number]) => {
    const today = formatLocalDate();
    const folder = template.folder ?? (selectedFolder === 'all' ? allFolders[0] || 'General' : selectedFolder);
    const title = template.title(today);
    const content = template.body(today);
    if (selectedFolder !== 'all' && selectedFolder !== folder) setSelectedFolder(folder);
    const q = searchQuery.trim().toLowerCase();
    if (q && !title.toLowerCase().includes(q) && !content.toLowerCase().includes(q)) setSearchQuery('');
    createNote(folder, title, content);
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

  const iconBtn =
    'inline-flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800';
  const chip = (active: boolean) =>
    `min-h-11 sm:min-h-8 px-3 rounded-full text-sm font-medium whitespace-nowrap ${
      active ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
    }`;

  const list = (
    <div className={`dm-card flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 ${pane === 'editor' ? 'hidden lg:flex' : 'flex'}`}>
      <div className="shrink-0 p-3 space-y-2 border-b border-stone-200 dark:border-stone-800">
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
        <div className="flex items-center gap-2">
          <div className="inline-flex">
            <button type="button" onClick={() => createFromTemplate(NOTE_TEMPLATES[0])} className={`${buttonClass.primary} rounded-r-none px-2 sm:px-3`}>
              <FilePlus className="w-4 h-4" /> New note
            </button>
            <Menu
              sheetTitle="Note templates"
              align="right"
              items={NOTE_TEMPLATES.map((template) => ({ label: template.label, onSelect: () => createFromTemplate(template) }))}
              trigger={(props) => (
                <button type="button" {...props} aria-label="Note templates" className={`${buttonClass.primary} rounded-l-none border-l border-stone-500 px-2`}>
                  <ChevronDown className="w-4 h-4" />
                </button>
              )}
            />
          </div>
          <button type="button" onClick={() => setShowNewFolder(!showNewFolder)} className={`${buttonClass.ghost} px-2`}>
            <FolderPlus className="w-4 h-4" /> Folder
          </button>
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

      <ul className="flex-1 min-h-0 overflow-y-auto rounded-b-xl divide-y divide-stone-100 dark:divide-stone-800">
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
    <div className={`dm-card flex-1 flex flex-col min-h-0 min-w-0 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden ${pane === 'list' && !focusMode ? 'hidden lg:flex' : 'flex'}`}>
      {activeNote ? (
        <>
          <div className="shrink-0 px-2 sm:px-3 py-2 border-b border-stone-200 dark:border-stone-800 space-y-1">
            <div className="flex min-w-0 items-center gap-1">
              <button type="button" onClick={() => { setFocusMode(false); setPane('list'); }} aria-label="Back to notes" className={`${iconBtn} lg:hidden`}>
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
                    requestAnimationFrame(() => {
                      if (viewMode === 'markdown') editorRef.current?.focus();
                      else richEditorRef.current?.focus();
                    });
                  }
                }}
                className="flex-1 min-w-0 w-0 truncate px-2 min-h-11 text-lg font-bold bg-transparent rounded-lg border border-transparent hover:border-stone-200 focus:border-stone-300 dark:hover:border-stone-700 focus:outline-hidden text-stone-900 dark:text-stone-50"
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
                sheetTitle={activeNote.title}
                align="right"
                items={[{ label: 'Delete note', icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: () => deleteNote(activeNote) }]}
                trigger={(props) => (
                  <button type="button" {...props} aria-label="More note actions" className={iconBtn}>
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                )}
              />
              {!compact && (
                <button type="button" aria-label="Focus mode" aria-pressed={focusMode} title="Focus mode (Ctrl/⌘ + .)" onClick={() => { setFocusMode((focused) => !focused); setPane('editor'); }} className={iconBtn}>
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-1 px-1">
              <label className="flex min-w-0 max-w-full items-center gap-1.5 text-sm text-stone-600 dark:text-stone-400 mr-1">
                Folder
                <select
                  value={activeNote.folder}
                  onChange={(e) => updateActive({ folder: e.target.value })}
                  className="min-w-0 max-w-full px-2 min-h-11 sm:min-h-9 text-sm bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100"
                >
                  {[...new Set([...allFolders, activeNote.folder])].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            </div>

          </div>

          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
            {viewMode === 'markdown' ? (
              <>
                <div role="toolbar" aria-label="Formatting" className="shrink-0 border-b border-stone-200 bg-stone-50 px-2 py-1 text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100">
                  <button type="button" aria-label="Markdown" title="Markdown" aria-pressed={true} onClick={() => setViewMode('rich')} className="min-h-11 min-w-11 px-3 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700"><FileCode className="w-4 h-4" /></button>
                </div>
                <label htmlFor="note-editor-textarea" className="sr-only">Note text (Markdown)</label>
                <textarea
                  id="note-editor-textarea"
                  ref={editorRef}
                  value={activeNote.content}
                  onChange={(e) => updateActive({ content: e.target.value })}
                  className="w-full h-full flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 text-[15px] sm:text-sm leading-relaxed bg-transparent border-0 focus:outline-hidden text-stone-900 dark:text-stone-100 resize-none placeholder:text-stone-500"
                  placeholder="Start writing… Markdown works: # heading, - [ ] checklist, **bold**"
                />
              </>
            ) : (
              <Suspense fallback={<div className="h-full p-4 text-stone-600 dark:text-stone-300" role="status">Loading editor…</div>}>
                <RichNoteEditor
                  key={activeNote.id}
                  ref={richEditorRef}
                  noteId={activeNote.id}
                  markdown={activeNote.content}
                  onChange={(content) => updateActive({ content })}
                  onOpenLink={openLinkedNote}
                  notes={notes}
                  onCreateNote={(title) => createNote(activeNote.folder, title).id}
                  onToggleMarkdown={() => setViewMode('markdown')}
                />
              </Suspense>
            )}
          </div>
          <footer className="shrink-0 px-4 py-2 border-t border-stone-200 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-400">
            {`Saved · ${words} ${words === 1 ? 'word' : 'words'} · edited ${editedLabel}`}
          </footer>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-stone-600 dark:text-stone-400">
          <p>Select a note, or start a new one.</p>
          <button type="button" onClick={() => createNote()} className={buttonClass.primary}>
            <FilePlus className="w-4 h-4" /> New note
          </button>
          {focusMode && <button type="button" aria-label="Focus mode" aria-pressed={focusMode} onClick={() => setFocusMode(false)} className={iconBtn}><Maximize2 className="w-4 h-4" /></button>}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={
        compact
          ? 'flex-1 min-h-0 min-w-0 flex flex-col gap-3 text-sm'
          : 'w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex-1 min-h-0 min-w-0 flex flex-col gap-3 text-sm'
      }
    >
      {(pane === 'list' || !compact) && (
        <div className={`flex items-center gap-2 ${pane === 'editor' ? 'hidden lg:flex' : ''}`}>
          <h1 className="text-xl font-bold text-[var(--dm-page-fg)] mr-auto">Notes</h1>
        </div>
      )}

      {compact ? (
        pane === 'list' ? list : editor
      ) : (
        <div className={`flex-1 min-h-0 min-w-0 grid grid-cols-1 grid-rows-[minmax(0,1fr)] gap-4 ${focusMode ? '' : 'lg:grid-cols-12'}`}>
          {!focusMode && <div className={`lg:col-span-4 xl:col-span-3 min-h-0 flex-col ${pane === 'editor' ? 'hidden lg:flex' : 'flex'}`}>{list}</div>}
          <div className={`min-h-0 min-w-0 flex-col ${pane === 'list' && !focusMode ? 'hidden lg:flex' : 'flex'} ${focusMode ? '' : 'lg:col-span-8 xl:col-span-9'}`}>{editor}</div>
        </div>
      )}
    </div>
  );
};
