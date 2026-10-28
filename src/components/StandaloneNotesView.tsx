import React, { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
import { EMPTY_NOTE_META, type NoteMeta, type StandaloneNote } from '../types/daymark';
import { Menu } from './ui/Menu';
import { Dialog, buttonClass } from './ui/Dialog';
import { confirmDialog, showToast } from './ui/feedback';
import { useBackHandler } from '../native/backButton';
import { formatNoteDate, noteChecklist, notePreview, sortNotes } from '../utils/notes';
import { NOTE_TEMPLATES, wordCount } from '../utils/noteTemplates';
import { formatLocalDate } from '../utils/clock';
import type { RichNoteEditorHandle } from './notes/RichNoteEditor';

import { buildFolderTree, createFolder as createEmptyFolder, renameFolder, moveFolder, deleteFolder, moveNote, folderMatches, normalizeFolderPath } from '../utils/noteFolders';
import { loadPanePrefs, savePanePrefs, paneMode, relatedPaneLayout, MIN_EDITOR_WIDTH } from '../utils/notesPanes';
import { NoteFolderTree, type FolderAction } from './notes/NoteFolderTree';
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

/** Notes: searchable list (pinned first) and a rich editor backed by Markdown. */
export const StandaloneNotesView: React.FC<StandaloneNotesViewProps> = ({ notes, onUpdateNotes, noteMeta = EMPTY_NOTE_META, onUpdateNoteMeta, compact = false, openNoteId, onOpenNoteConsumed, focusToggleSignal = 0, onFocusModeChange, pictureCleanupSignal = 0, richEditorHandleRef, railCollapsed = false }) => {
  const sorted = useMemo(() => sortNotes(notes), [notes]);
  const [selectedNoteId, setSelectedNoteId] = useState<string>(sorted[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('rich');
  const [notesView, setNotesView] = useState<'list' | 'graph'>('list');
  const [folderDialog, setFolderDialog] = useState<{ action: FolderAction; path: string } | null>(null);
  const [prefs, setPrefs] = useState(loadPanePrefs);
  const [width, setWidth] = useState(typeof window === 'undefined' ? 1440 : window.innerWidth ?? 1440);
  const graphActive = !compact && width >= 768 && notesView === 'graph';
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
  const listFoldersRef = useRef<HTMLButtonElement>(null);
  const latestMeta = useRef(noteMeta);
  latestMeta.current = noteMeta;
  const tree = useMemo(() => buildFolderTree(notes, noteMeta), [notes, noteMeta]);
  const mode = compact ? 'drawers' : paneMode(width);
  const drawers = mode === 'drawers';
  const layout = relatedPaneLayout(width, railCollapsed, prefs);
  const treeMinimized = layout.tree === 'min';
  useEffect(() => {
    const resize = () => { setWidth(window.innerWidth); };
    window.addEventListener?.('resize', resize);
    return () => window.removeEventListener?.('resize', resize);
  }, []);
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
    setNotesView('list');
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
  // The root row is distinct from All; folderMatches retains its empty-path domain semantics.
  const inSelectedFolder = (note: StandaloneNote) => selectedFolder === 'all' ||
    (selectedFolder === '' ? normalizeFolderPath(note.folder) === '' : folderMatches(note, selectedFolder));

  const filteredNotes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return sorted.filter(
      (n) =>
        inSelectedFolder(n) &&
        (!q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }, [sorted, selectedFolder, searchQuery]);

  const activeNote = notes.find((n) => n.id === selectedNoteId && inSelectedFolder(n)) || filteredNotes[0] || null;
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
    onOpen: (id: string) => { setSelectedNoteId(id); setSelectedFolder('all'); setPane('editor'); setRelatedOpen(false); },
    minimized: relatedMinimized,
    onToggleMinimized: () => {
      const next = { ...loadPanePrefs(), related: relatedMinimized ? 'open' as const : 'min' as const };
      setOverlayDismissed(false); setPrefs(next); savePanePrefs(next);
    },
  };

  const createNote = (folder = selectedFolder === 'all' ? allFolders[0] || 'General' : selectedFolder, title = 'Untitled', content = '', navigate = true) => {
    const now = new Date().toISOString();
    const note: StandaloneNote = { id: `note-${Date.now()}`, title, folder, content, tags: [], createdAt: now, updatedAt: now, pinned: false };
    latestNotes.current = [note, ...latestNotes.current];
    onUpdateNotes(latestNotes.current);
    if (navigate) {
      setSelectedNoteId(note.id);
      setViewMode('rich');
      setPane('editor');
      focusTitle.current = true;
    }
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
      setSelectedFolder('all');
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
      setSelectedFolder(destination); setFolderDialog(null); return;
    }
    if (action === 'delete') {
      const count = current.filter(note => folderMatches(note, path)).length;
      if (!await confirmDialog({ title: 'Delete folder?', message: deleteFolderMessage(path, count), confirmLabel: 'Delete', danger: true })) return;
      const result = deleteFolder(latestNotes.current, latestMeta.current, path, new Date().toISOString());
      applyFolderChange(result.notes, result.meta, 'Folder deleted.');
      setSelectedFolder(path.split('/').slice(0, -1).join('/')); return;
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
    setSelectedFolder(destination); setFolderDialog(null);
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
    setSelectedNoteId(id);
    setSelectedFolder('all');
  };
  const folderTree = <NoteFolderTree tree={tree} selectedPath={selectedFolder} compact={compact}
    minimized={!drawers && !drawer && treeMinimized}
    onSelect={path => {
      setSelectedFolder(path); setDrawer(false);
      if (drawers) {
        setFocusMode(false);
        setPane('list');
        if (drawer && typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => listFoldersRef.current?.focus());
      }
    }} onFolderAction={folderAction}
    onDropNote={moveNoteTo} onDropFolder={(path, parent) => { void changeFolder('move', path, parent); }} />;

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
  // Rows format dates and extract snippets for every note. The graph hides this
  // list, so do not build it on every render while the graph is active.
  const list = graphActive ? null : (
    <div className="dm-card flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800">
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
        <div className="flex flex-wrap items-center gap-2">
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
          <button type="button" aria-label="New folder" onClick={() => folderAction('new', selectedFolder === 'all' ? '' : selectedFolder)} className={`${buttonClass.ghost} px-2`}>
            <FolderPlus className="w-4 h-4" /> New folder
          </button>
        </div>
        {compact && <div className="max-h-[35dvh] overflow-y-auto">{folderTree}</div>}

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
                  draggable={!compact}
                  onDragStart={e => { e.dataTransfer.setData('application/daymark-note', note.id); e.dataTransfer.effectAllowed = 'move'; }}
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
    <div className="dm-card flex-1 flex flex-col min-h-0 min-w-0 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
      {activeNote ? (
        <>
          <div className="shrink-0 px-2 sm:px-3 py-2 border-b border-stone-200 dark:border-stone-800 space-y-1">
            <div className="flex min-w-0 items-center gap-1">
              <button type="button" onClick={() => { setFocusMode(false); setPane('list'); }} aria-label="Back to notes" className={drawers ? iconBtn : 'hidden'}>
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
              {drawers && <button type="button" aria-label="Folders" onClick={() => setDrawer(true)} className={buttonClass.secondary}>Folders</button>}
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
      {!compact && width >= 768 && <header aria-label="Notes view" className="shrink-0 flex items-center justify-between gap-3 text-[var(--dm-page-fg)]">
        <h1 className="font-semibold truncate">{graphActive ? 'Knowledge graph' : 'Notes'}</h1>
        <div role="group" aria-label="Notes presentation" className="flex gap-1 rounded-lg bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 p-1 border border-stone-200 dark:border-stone-700">
          <button type="button" className="min-h-11 px-3 rounded aria-pressed:bg-stone-200 dark:aria-pressed:bg-stone-700" aria-pressed={!graphActive} onClick={() => setNotesView('list')}>List</button>
          <button type="button" className="min-h-11 px-3 rounded aria-pressed:bg-stone-200 dark:aria-pressed:bg-stone-700" aria-pressed={graphActive} onClick={() => { setFocusMode(false); setNotesView('graph'); }}>Graph</button>
        </div>
      </header>}
      {compact && pane === 'list' && <h1 className="text-xl font-bold text-[var(--dm-page-fg)]">Notes</h1>}
      {!graphActive && drawers && (pane === 'list' || !activeNote) && <div className="shrink-0 flex items-center gap-2"><button ref={listFoldersRef} type="button" aria-label="Folders" onClick={() => setDrawer(true)} className={buttonClass.secondary}>Folders</button></div>}
      {drawer && <Dialog isOpen title="Folders" variant="sheet" onClose={() => setDrawer(false)}><div className="p-3">{folderTree}<button type="button" className={buttonClass.secondary} onClick={() => folderAction('new', selectedFolder === 'all' ? '' : selectedFolder)}>New folder</button></div></Dialog>}
      {folderDialog && <FolderDialogs key={folderDialog.action + folderDialog.path} {...folderDialog} tree={tree} onClose={() => setFolderDialog(null)} onSubmit={value => changeFolder(folderDialog.action, folderDialog.path, value)} />}
      <RelatedSheet {...relatedProps} isOpen={relatedOpen && !!activeNote} onClose={() => setRelatedOpen(false)} />
      {graphActive && graphIndex ? <Suspense fallback={<div role="status" className="p-4">Loading graph…</div>}>
        <GraphView notes={notes} index={graphIndex} dismissed={graphDismissed} folderTree={tree} selectedFolder={selectedFolder} activeNoteId={activeNote?.id}
          onOpenNote={id => { relatedProps.onOpen(id); setNotesView('list'); }} onLink={linkNotes} onDismiss={dismissPair} />
      </Suspense> : compact ? (pane === 'list' ? list : editor) : (
        <div className="flex-1 min-h-0 min-w-0 flex gap-3">
          {!focusMode && <div role="group" aria-label="Notes navigation" className={`shrink-0 min-h-0 gap-2 ${drawers ? (pane === 'editor' ? 'hidden' : 'flex w-full') : 'flex'}`}>
            {!drawers && <aside aria-label="Folder navigation" className={`${treeMinimized ? 'w-14' : 'w-56'} shrink-0 overflow-y-auto border border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900 p-1`}>
              <button type="button" aria-label={treeMinimized ? 'Expand folders' : 'Minimize folders'} title={treeMinimized ? 'Expand folders' : 'Minimize folders'} className="min-h-11 w-full text-stone-700 dark:text-stone-200" onClick={() => {
                if (treeMinimized && prefs.tree === 'open') { setDrawer(true); return; }
                const next = { ...loadPanePrefs(), tree: treeMinimized ? 'open' as const : 'min' as const }; setPrefs(next); savePanePrefs(next);
              }}>{treeMinimized ? <ChevronRight className="w-4 h-4 mx-auto" aria-hidden="true" /> : <span className="flex items-center justify-center gap-1"><ChevronLeft className="w-4 h-4" aria-hidden="true" />Folders</span>}</button>
              {folderTree}
            </aside>}
            <section aria-label="Notes list" className={`${drawers ? 'w-full' : 'w-64'} min-h-0 flex flex-col`}>{list}</section>
          </div>}
          <div role="group" aria-label="Note editor" style={!drawers ? { minWidth: MIN_EDITOR_WIDTH } : undefined} className={`relative min-h-0 min-w-0 flex-1 flex-col ${drawers && pane === 'list' && !focusMode ? 'hidden' : 'flex'}`}>
            {editor}
            {!focusMode && activeNote && overlayOpen && <RelatedOverlay {...relatedProps} onClose={() => setOverlayDismissed(true)} />}
          </div>
          {!drawers && !focusMode && activeNote && <RelatedPanel {...relatedProps} minimized={layout.overlay || relatedMinimized} overlayOpen={overlayOpen} />}
        </div>
      )}
    </div>
  );
};
