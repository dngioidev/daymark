import React, { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FilePlus,
  FileCode,
  Maximize2,
  MoreHorizontal,
  Pin,
  Trash2,
} from 'lucide-react';
import { EMPTY_NOTE_META, type NoteMeta, type StandaloneNote } from '../types/daymark';
import { Menu } from './ui/Menu';
import { buttonClass } from './ui/Dialog';
import { confirmDialog, showToast } from './ui/feedback';
import { useBackHandler } from '../native/backButton';
import { formatNoteDate, sortNotes } from '../utils/notes';
import { NOTE_TEMPLATES, wordCount } from '../utils/noteTemplates';
import { formatLocalDate } from '../utils/clock';
import type { RichNoteEditorHandle } from './notes/RichNoteEditor';

import { buildFolderTree, createFolder as createEmptyFolder, renameFolder, moveFolder, deleteFolder, moveNote, folderMatches, normalizeFolderPath } from '../utils/noteFolders';
import { loadPanePrefs, savePanePrefs, MIN_EDITOR_WIDTH } from '../utils/notesPanes';
import { NoteNavigation } from './notes/NoteNavigation';
import { useNoteNavigationState } from './notes/useNoteNavigationState';
import type { FolderAction } from './notes/NoteFolderTree';
import { ViewSwitch } from './notes/ViewSwitch';
import { NotesStrip } from './notes/NotesStrip';
import { NotesDrawer } from './notes/NotesDrawer';
import { PhoneNotes } from './notes/PhoneNotes';
import { useNotesLayout } from './notes/useNotesLayout';
import { FolderPicker, flattenFolders } from './notes/FolderPicker';
import { FolderDialogs, deleteFolderMessage, mergeFolderMessage } from './notes/FolderDialogs';
import { useRelatedNotes } from '../hooks/useRelatedNotes';
import { addRelatedLink, buildNoteIndex, canLinkToTitle, pairKey } from '../utils/noteRelated';
import { RelatedPanel, RelatedOverlay } from './notes/RelatedPanel';
import { RelatedSheet } from './notes/RelatedSheet';
const RichNoteEditor = React.lazy(() => import('./notes/RichNoteEditor'));
const GraphView = React.lazy(() => import('./notes/graph/GraphView'));

interface StandaloneNotesViewProps {
  notes: StandaloneNote[];
  noteMeta?: NoteMeta;
  onUpdateNoteMeta?: (meta: NoteMeta) => void;
  onUpdateNotes: (notes: StandaloneNote[]) => void;
  /** Phone shell: one pane at a time, no outer page padding. */
  compact?: boolean;
  openNoteId?: string;
  onOpenNoteConsumed?: () => void;
  focusToggleSignal?: number;
  onFocusModeChange?: (focused: boolean) => void;
  pictureCleanupSignal?: number;
  richEditorHandleRef?: React.RefObject<RichNoteEditorHandle | null>;
  railCollapsed?: boolean;
}

type ViewMode = 'rich' | 'markdown';

/** Notes: one navigation tree and a rich editor backed by Markdown. */
export const StandaloneNotesView: React.FC<StandaloneNotesViewProps> = ({ notes, onUpdateNotes, noteMeta = EMPTY_NOTE_META, onUpdateNoteMeta, compact = false, openNoteId, onOpenNoteConsumed, focusToggleSignal = 0, onFocusModeChange, pictureCleanupSignal = 0, richEditorHandleRef, railCollapsed = false }) => {
  const sorted = useMemo(() => sortNotes(notes), [notes]);
  const [selectedNoteId, setSelectedNoteId] = useState<string>(sorted[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const activeNote = notes.find((n) => n.id === selectedNoteId) || sorted[0] || null;
  const { currentFolder, setCurrentFolder, expanded, setExpanded, revealFolder } = useNoteNavigationState(notes, activeNote?.id ?? '');
  const [viewMode, setViewMode] = useState<ViewMode>('rich');
  const [notesView, setNotesView] = useState<'list' | 'graph'>('list');
  const focusViewSwitch = useRef(false);
  const [folderDialog, setFolderDialog] = useState<{ action: FolderAction; path: string } | null>(null);
  const { phone, mode, drawers, layout, treeMinimized, prefs, setPrefs } = useNotesLayout(compact, railCollapsed);
  const graphActive = !phone && notesView === 'graph';
  const graphIndex = useMemo(() => graphActive ? buildNoteIndex(notes) : null, [graphActive, notes]);
  const graphDismissed = useMemo(() => {
    const latest = new Map<string, NoteMeta['dismissed'][number]>();
    for (const pair of noteMeta.dismissed) {
      const previous = latest.get(pair.key);
      if (!previous || pair.at >= previous.at) latest.set(pair.key, pair);
    }
    return new Set([...latest.values()].filter(pair => !pair.restored).map(pair => pair.key));
  }, [noteMeta.dismissed]);
  const [drawer, setDrawer] = useState(false);
  const notesButton = useRef<HTMLButtonElement>(null);
  const focusSearch = useRef(false);
  const latestMeta = useRef(noteMeta);
  latestMeta.current = noteMeta;
  const tree = useMemo(() => buildFolderTree(notes, noteMeta), [notes, noteMeta]);
  const [pane, setPane] = useState<'list' | 'editor'>('list');
  const [focusMode, setFocusMode] = useState(false);
  useEffect(() => {
    onFocusModeChange?.(focusMode);
    return () => onFocusModeChange?.(false);
  }, [focusMode, onFocusModeChange]);
  const [now, setNow] = useState(Date.now());
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const localRichEditorRef = useRef<RichNoteEditorHandle>(null);
  const richEditorRef = richEditorHandleRef ?? localRichEditorRef;
  const focusTitle = useRef(false);
  // Wiki creation and link insertion save in the same React batch. Keep the
  // newly created note when the editor immediately saves the source note.
  const latestNotes = useRef(notes);
  latestNotes.current = notes;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const previousFocusSignal = useRef(focusToggleSignal);
  useEffect(() => {
    if (previousFocusSignal.current === focusToggleSignal) return;
    previousFocusSignal.current = focusToggleSignal;
    if (phone) return;
    setFocusMode((focused) => !focused);
    setPane('editor');
  }, [focusToggleSignal, phone]);

  useEffect(() => {
    if (!openNoteId || !notes.some((note) => note.id === openNoteId)) return;
    openNote(openNoteId);
    setPane('editor');
    setNotesView('list');
    onOpenNoteConsumed?.();
  }, [openNoteId, notes, onOpenNoteConsumed]);

  useEffect(() => {
    if (phone) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (event.key === 'Escape' && focusMode && target?.tagName !== 'TEXTAREA') {
        setFocusMode(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phone, focusMode]);

  // Android Back: editor -> list
  useBackHandler(() => (setFocusMode(false), setPane('list'), true), phone && pane === 'editor');

  function openNote(id: string) {
    const note = latestNotes.current.find(note => note.id === id);
    if (!note) return;
    focusViewSwitch.current = false;
    setSelectedNoteId(id); revealFolder(note.folder); setPane('editor'); setDrawer(false);
  }
  const editedMinutes = activeNote ? Math.max(0, Math.floor((now - new Date(activeNote.updatedAt).getTime()) / 60_000)) : 0;
  const editedLabel = editedMinutes < 1 ? 'just now' : editedMinutes < 60 ? `${editedMinutes} min ago` : activeNote ? formatNoteDate(activeNote.updatedAt) : '';
  const words = activeNote ? wordCount(activeNote.content) : 0;
  // The graph replaces the Related panel and builds its own index; do not rebuild a second one meanwhile.
  const related = useRelatedNotes(notes, activeNote?.id ?? '', noteMeta.dismissed, !graphActive);
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const overlayOpen = !drawers && layout.overlay && !overlayDismissed;
  const relatedMinimized = layout.related === 'min' || (layout.overlay && !overlayOpen);
  useEffect(() => { setRelatedOpen(false); setDrawer(false); setOverlayDismissed(false); }, [mode, layout.overlay]);

  useEffect(() => {
    if (focusTitle.current && titleRef.current) {
      focusTitle.current = false;
      titleRef.current.focus();
      titleRef.current.select();
    }
  });

  const updateActive = (updates: Partial<StandaloneNote>) => {
    if (!activeNote) return;
    latestNotes.current = latestNotes.current.map((n) => (n.id === activeNote.id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n));
    onUpdateNotes(latestNotes.current);
  };

  const setPairDismissed = (sourceId: string, targetId: string, restored: boolean) => {
    const key = pairKey(sourceId, targetId);
    const meta = latestMeta.current;
    const next = { ...meta, dismissed: [...meta.dismissed.filter(pair => pair.key !== key), { key, at: new Date().toISOString(), restored }] };
    latestMeta.current = next;
    onUpdateNoteMeta?.(next);
  };
  const linkNotes = (sourceId: string, targetId: string) => {
    const source = latestNotes.current.find(note => note.id === sourceId);
    const target = latestNotes.current.find(note => note.id === targetId);
    if (!source || !target) {
      showToast('That note no longer exists. Suggestions are refreshing.', { tone: 'info' });
      related.refresh(); return;
    }
    if (source.id === target.id || !canLinkToTitle(target.title)) return;
    if (!graphActive && source.id === activeNote?.id && viewMode === 'rich') {
      if (!richEditorRef.current) { showToast('The editor is still loading, try again', { tone: 'info' }); return; }
      richEditorRef.current.appendRelatedLink(target.title);
    } else {
      const content = addRelatedLink(source.content, target.title);
      if (content === source.content) return;
      latestNotes.current = latestNotes.current.map(note => note.id === sourceId ? { ...note, content, updatedAt: new Date().toISOString() } : note);
      onUpdateNotes(latestNotes.current);
    }
  };
  const dismissPair = (a: string, b: string) => {
    setPairDismissed(a, b, false);
    showToast('Suggestion hidden.', { action: { label: 'Undo', onClick: () => setPairDismissed(a, b, true) } });
  };
  const relatedProps = {
    ...related,
    onLink: (id: string) => {
      if (activeNote) linkNotes(activeNote.id, id);
    },
    onDismiss: (id: string) => {
      if (!activeNote) return;
      dismissPair(activeNote.id, id);
    },
    onRestore: (id: string) => { if (activeNote) setPairDismissed(activeNote.id, id, true); },
    onOpen: (id: string) => { openNote(id); setRelatedOpen(false); },
    minimized: relatedMinimized,
    onToggleMinimized: () => {
      const next = { ...loadPanePrefs(), related: relatedMinimized ? 'open' as const : 'min' as const };
      setOverlayDismissed(false); setPrefs(next); savePanePrefs(next);
    },
  };

  const createNote = (folder = currentFolder, title = 'Untitled', content = '', navigate = true) => {
    const now = new Date().toISOString();
    const note: StandaloneNote = { id: `note-${Date.now()}`, title, folder, content, tags: [], createdAt: now, updatedAt: now, pinned: false };
    latestNotes.current = [note, ...latestNotes.current];
    onUpdateNotes(latestNotes.current);
    if (navigate) {
      openNote(note.id);
      setViewMode('rich');
      setPane('editor');
      focusTitle.current = true;
    }
    return note;
  };

  const createFromTemplate = (template: (typeof NOTE_TEMPLATES)[number]) => {
    const today = formatLocalDate();
    const folder = template.folder ?? currentFolder;
    const title = template.title(today);
    const content = template.body(today);
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

  const applyFolderChange = (nextNotes: StandaloneNote[], meta: NoteMeta, label: string) => {
    const beforeNotes = latestNotes.current;
    const beforeMeta = latestMeta.current;
    latestNotes.current = nextNotes;
    latestMeta.current = meta;
    onUpdateNotes(nextNotes);
    onUpdateNoteMeta?.(meta);
    showToast(label, { action: { label: 'Undo', onClick: () => {
      if (latestNotes.current !== nextNotes || latestMeta.current !== meta) {
        showToast("Can't undo: the notes changed since.", { tone: 'error' }); return;
      }
      const nowIso = new Date().toISOString();
      const restored = beforeNotes.map(note => nextNotes.find(next => next.id === note.id) === note ? note : { ...note, updatedAt: nowIso });
      const oldPaths = new Set(beforeMeta.folders.map(folder => folder.path.toLowerCase()));
      const restoredMeta = { ...beforeMeta, folders: [
        ...beforeMeta.folders.map(folder => ({ ...folder, updatedAt: nowIso })),
        ...meta.folders.filter(folder => !oldPaths.has(folder.path.toLowerCase())).map(folder => ({ ...folder, removed: true, updatedAt: nowIso })),
      ] };
      latestNotes.current = restored; latestMeta.current = restoredMeta;
      onUpdateNotes(restored); onUpdateNoteMeta?.(restoredMeta);
      setCurrentFolder('');
    } } });
  };
  const changeFolder = async (action: FolderAction, path: string, value = '') => {
    if (action === 'move' && normalizeFolderPath(path).toLowerCase() === normalizeFolderPath(value).toLowerCase()) return;
    const current = latestNotes.current;
    const meta = latestMeta.current;
    const nowIso = new Date().toISOString();
    if (action === 'new') {
      const name = value.trim();
      if (!name || name.includes('/')) return;
      const destination = normalizeFolderPath(path ? path + '/' + name : name);
      applyFolderChange(current, createEmptyFolder(meta, destination, nowIso), 'Folder created.');
      revealFolder(destination); setFolderDialog(null); return;
    }
    if (action === 'delete') {
      const count = current.filter(note => folderMatches(note, path)).length;
      if (!await confirmDialog({ title: 'Delete folder?', message: deleteFolderMessage(path, count), confirmLabel: 'Delete', danger: true })) return;
      const result = deleteFolder(latestNotes.current, latestMeta.current, path, new Date().toISOString());
      applyFolderChange(result.notes, result.meta, 'Folder deleted.');
      revealFolder(path.split('/').slice(0, -1).join('/')); return;
    }
    if (action === 'rename' && (!value.trim() || value.includes('/'))) return;
    const parent = path.split('/').slice(0, -1).join('/');
    const destination = normalizeFolderPath(action === 'move' ? [value, path.split('/').at(-1)].filter(Boolean).join('/') : [parent, value].filter(Boolean).join('/'));
    if (destination === path) { setFolderDialog(null); return; }
    if (destination.toLowerCase().startsWith(path.toLowerCase() + '/')) {
      showToast('A folder cannot move inside itself.', { tone: 'error' }); return;
    }
    const collision = flattenFolders(buildFolderTree(current, meta)).some(node => node.path.toLowerCase() === destination.toLowerCase() && node.path.toLowerCase() !== path.toLowerCase());
    if (collision) {
      const count = current.filter(note => folderMatches(note, path) || folderMatches(note, destination)).length;
      if (!await confirmDialog({ title: 'Merge folders?', message: mergeFolderMessage(destination, count), confirmLabel: 'Merge' })) return;
    }
    const result = action === 'move'
      ? moveFolder(latestNotes.current, latestMeta.current, path, value, new Date().toISOString())
      : renameFolder(latestNotes.current, latestMeta.current, path, destination, new Date().toISOString());
    if (!result) return;
    applyFolderChange(result.notes, result.meta, 'Folder updated.');
    revealFolder(destination); setFolderDialog(null);
  };
  const folderAction = (action: FolderAction, path: string) => {
    if (action === 'delete') void changeFolder(action, path);
    else { setDrawer(false); setFolderDialog({ action, path }); }
  };
  const moveNoteTo = (id: string, path: string) => {
    const source = latestNotes.current.find(note => note.id === id);
    if (!source || source.folder === path) return;
    const nowIso = new Date().toISOString();
    // Inferred folders must survive moving their last note, just like explicitly created folders.
    const meta = createEmptyFolder(latestMeta.current, source.folder, nowIso);
    applyFolderChange(moveNote(latestNotes.current, id, path, nowIso), meta, 'Note moved.');
    openNote(id);
  };
  const openLinkedNote = (noteTitle: string) => {
    const target = notes.find((n) => n.title.toLowerCase().trim() === noteTitle.toLowerCase().trim());
    if (target) {
      openNote(target.id);
    } else createNote(activeNote?.folder || 'General', noteTitle);
  };

  const changeNotesView = (value: 'list' | 'graph', keyboard = false) => {
    focusViewSwitch.current = keyboard; setFocusMode(false); setDrawer(value === 'list' && drawers); setNotesView(value);
  };
  const expandColumn = (search = false) => {
    focusSearch.current = search;
    const next = { ...loadPanePrefs(), tree: 'open' as const }; setPrefs(next); savePanePrefs(next);
    if (treeMinimized && prefs.tree === 'open') setDrawer(true);
  };

  const iconBtn =
    'inline-flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800';
  const list = graphActive ? null : <NoteNavigation notes={notes} meta={noteMeta} openNoteId={activeNote?.id}
    currentFolder={currentFolder} expanded={expanded} onExpandedChange={setExpanded}
    query={searchQuery} onQueryChange={setSearchQuery} onOpenNote={openNote} onSelectFolder={setCurrentFolder}
    onNewNote={() => createFromTemplate(NOTE_TEMPLATES[0])}
    templateItems={NOTE_TEMPLATES.map(template => ({ label: template.label, onSelect: () => createFromTemplate(template) }))}
    onNewFolder={() => folderAction('new', currentFolder)} onFolderAction={folderAction}
    onDropNote={moveNoteTo} onDropFolder={(path, parent) => { void changeFolder('move', path, parent); }}
    compact={phone} dragEnabled={!phone} focusSearch={focusSearch}
    viewSwitch={!phone ? <ViewSwitch value="list" focusOnMount={focusViewSwitch} onChange={changeNotesView} /> : undefined} />;

  const editor = (
    <div className="dm-card flex-1 flex flex-col min-h-0 min-w-0 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
      {activeNote ? (
        <>
          <div className="shrink-0 px-2 sm:px-3 py-2 border-b border-stone-200 dark:border-stone-800 space-y-1">
            <div className="flex min-w-0 items-center gap-1">
              <button type="button" onClick={() => { setFocusMode(false); setPane('list'); if (!phone && drawers) setDrawer(true); }} aria-label="Back to notes" className={drawers ? iconBtn : 'hidden'}>
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
              {!phone && (
                <button type="button" aria-label="Focus mode" aria-pressed={focusMode} title="Focus mode (Ctrl/⌘ + .)" onClick={() => { setFocusMode((focused) => !focused); setPane('editor'); }} className={iconBtn}>
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-1 px-1">
              {drawers && !phone && <button type="button" ref={notesButton} aria-label="Notes" aria-haspopup="dialog" onClick={() => setDrawer(true)} className={buttonClass.secondary}>Notes</button>}
              <FolderPicker tree={tree} value={activeNote.folder} onChange={path => moveNoteTo(activeNote.id, path)} />
              {drawers && <button type="button" className={`${buttonClass.secondary} min-h-11`} aria-haspopup="dialog" onClick={() => setRelatedOpen(true)}>Related · {related.suggestions.length}</button>}
            </div>

          </div>

          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
            {viewMode === 'markdown' ? (
              <>
                <div role="toolbar" aria-label="Formatting" className="sticky top-0 z-10 shrink-0 border-b border-stone-200 bg-stone-50 px-2 py-1 text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100">
                  <button type="button" aria-label="Markdown" title="Markdown" aria-pressed={true} onClick={() => setViewMode('rich')} className="min-h-11 min-w-11 px-3 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700"><FileCode className="w-4 h-4" /></button>
                </div>
                <label htmlFor="note-editor-textarea" className="sr-only">Note text (Markdown)</label>
                <textarea
                  key={`${selectedNoteId}:${pictureCleanupSignal}`}
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
                  notes={[...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(({ id, title }) => ({ id, title }))}
                  onCreateNote={(title) => createNote(activeNote.folder, title, '', false).id}
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
          {drawers && !phone && <button type="button" ref={notesButton} aria-label="Notes" aria-haspopup="dialog" onClick={() => setDrawer(true)} className={buttonClass.secondary}>Notes</button>}
          <button type="button" onClick={() => createNote()} className={buttonClass.primary}>
            <FilePlus className="w-4 h-4" /> New note
          </button>
          {focusMode && <button type="button" aria-label="Focus mode" aria-pressed={focusMode} onClick={() => setFocusMode(false)} className={iconBtn}><Maximize2 className="w-4 h-4" /></button>}
        </div>
      )}
    </div>
  );

  return (
    <div className={compact ? 'flex-1 min-h-0 min-w-0 flex flex-col gap-3 text-sm' : 'w-full max-w-[1800px] mx-auto px-4 xl:px-8 py-2 flex-1 min-h-0 min-w-0 flex flex-col gap-3 text-sm'}>
      {phone && pane === 'list' && (compact ? <h1 className="text-xl font-bold text-[var(--dm-page-fg)]">Notes</h1> : <p className="text-xl font-bold text-[var(--dm-page-fg)]">Notes</p>)}
      {drawer && !phone && <NotesDrawer returnFocusRef={notesButton} onClose={() => setDrawer(false)}>{list}</NotesDrawer>}
      {folderDialog && <FolderDialogs key={folderDialog.action + folderDialog.path} {...folderDialog} tree={tree} onClose={() => setFolderDialog(null)} onSubmit={value => changeFolder(folderDialog.action, folderDialog.path, value)} />}
      <RelatedSheet {...relatedProps} isOpen={relatedOpen && !!activeNote} onClose={() => setRelatedOpen(false)} />
      {graphActive && graphIndex ? <Suspense fallback={<div role="status" className="p-4">Loading graph…</div>}>
        <GraphView notes={notes} index={graphIndex} dismissed={graphDismissed} folderTree={tree} selectedFolder={currentFolder} activeNoteId={activeNote?.id}
          onViewChange={changeNotesView} focusViewSwitch={focusViewSwitch} onOpenNote={id => { relatedProps.onOpen(id); setNotesView('list'); }} onLink={linkNotes} onDismiss={dismissPair} />
      </Suspense> : phone ? <PhoneNotes pane={pane} navigation={list} editor={editor} /> : (
        <div className="flex-1 min-h-0 min-w-0 flex gap-3">
          {!focusMode && !drawers && <div role="group" aria-label="Notes navigation" className="shrink-0 min-h-0 flex">
            <aside aria-label="Folder navigation" className={(treeMinimized ? 'w-14' : 'w-72') + ' shrink-0 min-h-0 flex flex-col border border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900 p-1'}>
              <button type="button" aria-label={treeMinimized ? 'Expand folders' : 'Minimize folders'} title={treeMinimized ? 'Expand folders' : 'Minimize folders'} className="min-h-11 shrink-0 w-full text-stone-700 dark:text-stone-200" onClick={() => {
                focusSearch.current = false;
                if (treeMinimized && prefs.tree === 'open') { setDrawer(true); return; }
                const next = { ...loadPanePrefs(), tree: treeMinimized ? 'open' as const : 'min' as const }; setPrefs(next); savePanePrefs(next);
              }}>{treeMinimized ? <ChevronRight className="w-4 h-4 mx-auto" aria-hidden="true" /> : <span className="flex items-center justify-center gap-1"><ChevronLeft className="w-4 h-4" aria-hidden="true" />Folders</span>}</button>
              {treeMinimized ? <NotesStrip tree={tree} onSearch={() => expandColumn(true)}
                onNewNote={() => createFromTemplate(NOTE_TEMPLATES[0])} onNewFolder={() => folderAction('new', currentFolder)}
                onFolder={path => { revealFolder(path); expandColumn(); }} onExpand={() => expandColumn()} /> : list}
            </aside>
          </div>}
          <div role="group" aria-label="Note editor" style={!drawers ? { minWidth: MIN_EDITOR_WIDTH } : undefined} className="relative min-h-0 min-w-0 flex-1 flex-col flex">
            {editor}
            {!focusMode && activeNote && overlayOpen && <RelatedOverlay {...relatedProps} onClose={() => setOverlayDismissed(true)} />}
          </div>
          {!drawers && !focusMode && activeNote && <RelatedPanel {...relatedProps} minimized={layout.overlay || relatedMinimized} overlayOpen={overlayOpen} />}
        </div>
      )}
    </div>
  );
};
