import React, { useState, useMemo } from 'react';
import {
  FolderOpen,
  FolderPlus,
  FilePlus,
  FileText,
  Search,
  Pin,
  Trash2,
  Edit2,
  Eye,
  Columns,
  Code,
  CheckSquare,
  Heading1,
  Heading2,
  Bold,
  Italic,
  Link2,
} from 'lucide-react';
import { StandaloneNote } from '../types/daymark';
import { MarkdownPreview } from './MarkdownPreview';

interface StandaloneNotesViewProps {
  notes: StandaloneNote[];
  onUpdateNotes: (notes: StandaloneNote[]) => void;
}

export const StandaloneNotesView: React.FC<StandaloneNotesViewProps> = ({
  notes,
  onUpdateNotes,
}) => {
  const [selectedNoteId, setSelectedNoteId] = useState<string>(notes[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [noteViewMode, setNoteViewMode] = useState<'editor' | 'split' | 'preview'>('split');
  const [newFolderInput, setNewFolderInput] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  // Extract all unique folders
  const allFolders = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      if (n.folder) set.add(n.folder);
    }
    return Array.from(set).sort();
  }, [notes]);

  // Filter notes by search & folder
  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      const matchFolder = selectedFolder === 'all' || n.folder === selectedFolder;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q));
      return matchFolder && matchSearch;
    });
  }, [notes, selectedFolder, searchQuery]);

  const activeNote = notes.find((n) => n.id === selectedNoteId) || filteredNotes[0] || null;

  const handleUpdateActiveNote = (updates: Partial<StandaloneNote>) => {
    if (!activeNote) return;
    const updatedList = notes.map((n) =>
      n.id === activeNote.id
        ? { ...n, ...updates, updatedAt: new Date().toISOString() }
        : n
    );
    onUpdateNotes(updatedList);
  };

  const handleCreateNewNote = () => {
    const newNote: StandaloneNote = {
      id: `note-${Date.now()}`,
      title: 'Untitled Note',
      folder: selectedFolder === 'all' ? 'Technical' : selectedFolder,
      content: '# Untitled Note\n\nWrite your thoughts, technical references, or architecture decisions here...',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
    };
    onUpdateNotes([newNote, ...notes]);
    setSelectedNoteId(newNote.id);
  };

  const handleDeleteNote = (noteId: string) => {
    if (confirm('Are you sure you want to delete this note?')) {
      const updated = notes.filter((n) => n.id !== noteId);
      onUpdateNotes(updated);
      if (selectedNoteId === noteId) {
        setSelectedNoteId(updated[0]?.id || '');
      }
    }
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderInput.trim()) return;
    const folderName = newFolderInput.trim();
    // Create an initial note in this folder
    const initialNote: StandaloneNote = {
      id: `note-${Date.now()}`,
      title: `${folderName} Overview`,
      folder: folderName,
      content: `# ${folderName}\n\nFolder description and index.`,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onUpdateNotes([initialNote, ...notes]);
    setSelectedFolder(folderName);
    setSelectedNoteId(initialNote.id);
    setNewFolderInput('');
    setShowNewFolder(false);
  };

  const handleInternalLinkClick = (noteTitle: string) => {
    const target = notes.find((n) => n.title.toLowerCase().trim() === noteTitle.toLowerCase().trim());
    if (target) {
      setSelectedNoteId(target.id);
      setSelectedFolder('all');
    } else {
      const newNote: StandaloneNote = {
        id: `note-${Date.now()}`,
        title: noteTitle,
        folder: activeNote?.folder || 'Technical',
        content: `# ${noteTitle}\n\nLinked note content...`,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onUpdateNotes([newNote, ...notes]);
      setSelectedNoteId(newNote.id);
    }
  };

  // Quick formatting insert
  const insertFormatting = (prefix: string, suffix = '') => {
    if (!activeNote) return;
    const textarea = document.getElementById('note-editor-textarea') as HTMLTextAreaElement | null;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = activeNote.content;
    const selected = current.substring(start, end);

    const replacement = `${prefix}${selected || 'text'}${suffix}`;
    const newContent = current.substring(0, start) + replacement + current.substring(end);
    handleUpdateActiveNote({ content: newContent });
  };

  // Interactive checklist toggle in active note
  const handleToggleCheckboxInActiveNote = (taskIndex: number, newChecked: boolean) => {
    if (!activeNote) return;
    let count = 0;
    const updatedContent = activeNote.content.replace(/([-*]\s*\[)([ xX])(\])/g, (match, prefix, cur, suffix) => {
      if (count === taskIndex) {
        count++;
        return `${prefix}${newChecked ? 'x' : ' '}${suffix}`;
      }
      count++;
      return match;
    });
    handleUpdateActiveNote({ content: updatedContent });
  };

  // Mobile navigation state: 'list' vs 'editor'
  const [mobilePane, setMobilePane] = useState<'list' | 'editor'>('list');

  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-3 h-[calc(100vh-4.5rem)] flex flex-col space-y-3">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-stone-200 dark:border-stone-800">
        <div>
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-amber-600 dark:text-amber-500" />
            <span>Standalone Markdown Notes</span>
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Unrestricted Markdown documents organized in folder hierarchies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewFolder(!showNewFolder)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-300 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 rounded-md transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>New Folder</span>
          </button>

          <button
            onClick={handleCreateNewNote}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 rounded-md shadow-2xs transition-colors"
          >
            <FilePlus className="w-3.5 h-3.5" />
            <span>New Note</span>
          </button>
        </div>
      </div>

      {/* Main Responsive Workspace Layout: Expansive Desktop 3-Column / Mobile Single-Pane */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Column 1 & 2: Folder Sidebar & Note List */}
        <div
          className={`lg:col-span-4 xl:col-span-3 flex flex-col h-full bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-2xs ${
            mobilePane === 'editor' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Search Bar */}
          <div className="p-3 border-b border-stone-200 dark:border-stone-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search notes or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-md text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* Folder filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto mt-2.5 pb-1 text-xs">
              <button
                onClick={() => setSelectedFolder('all')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                  selectedFolder === 'all'
                    ? 'bg-amber-600 text-white font-semibold'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                All ({notes.length})
              </button>
              {allFolders.map((f) => (
                <button
                  key={f}
                  onClick={() => setSelectedFolder(f)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                    selectedFolder === f
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Inline New Folder Input */}
            {showNewFolder && (
              <form onSubmit={handleCreateFolder} className="mt-2 flex gap-1.5">
                <input
                  type="text"
                  placeholder="Folder name..."
                  value={newFolderInput}
                  onChange={(e) => setNewFolderInput(e.target.value)}
                  className="flex-1 text-xs px-2.5 py-1 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded text-stone-900 dark:text-stone-100"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 text-xs bg-stone-800 text-white rounded font-medium"
                >
                  Create
                </button>
              </form>
            )}
          </div>

          {/* Notes list */}
          <div className="flex-1 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800/80">
            {filteredNotes.length > 0 ? (
              filteredNotes.map((note) => {
                const isSelected = note.id === activeNote?.id;
                return (
                  <button
                    key={note.id}
                    onClick={() => {
                      setSelectedNoteId(note.id);
                      setMobilePane('editor');
                    }}
                    className={`w-full text-left p-3 transition-colors ${
                      isSelected
                        ? 'bg-amber-50/50 dark:bg-amber-950/20'
                        : 'hover:bg-stone-50 dark:hover:bg-stone-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-xs text-stone-900 dark:text-stone-100 truncate">
                        {note.title}
                      </div>
                      {note.pinned && <Pin className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />}
                    </div>

                    <div className="mt-1 text-[11px] text-stone-500 dark:text-stone-400 flex items-center gap-2">
                      <span className="font-medium text-amber-700 dark:text-amber-400">{note.folder}</span>
                      <span>·</span>
                      <span className="font-mono text-[10px]">
                        {new Date(note.updatedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="mt-1 text-[11px] text-stone-400 line-clamp-2">
                      {note.content.replace(/^#+\s+/gm, '').replace(/\n+/g, ' ')}
                    </p>
                  </button>
                );
              })
            ) : (
              <div className="p-8 text-center text-xs text-stone-400">
                No notes found matching your filter.
              </div>
            )}
          </div>
        </div>

        {/* Column 3: Active Note Editor & Preview (Expansive desktop workspace) */}
        <div
          className={`lg:col-span-8 xl:col-span-9 flex flex-col h-full bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-2xs ${
            mobilePane === 'list' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {activeNote ? (
            <>
              {/* Note Header Toolbar */}
              <div className="p-3 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3 bg-stone-50/50 dark:bg-stone-900/50">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  {/* Mobile Back Button to Notes List */}
                  <button
                    onClick={() => setMobilePane('list')}
                    className="lg:hidden inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-stone-700 dark:text-stone-300 bg-stone-200 dark:bg-stone-800 rounded mr-1"
                  >
                    ← Notes
                  </button>

                  <select
                    value={activeNote.folder}
                    onChange={(e) => handleUpdateActiveNote({ folder: e.target.value })}
                    className="text-xs px-2 py-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded text-stone-700 dark:text-stone-300 font-medium"
                  >
                    {allFolders.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={activeNote.title}
                    onChange={(e) => handleUpdateActiveNote({ title: e.target.value })}
                    className="flex-1 text-sm font-bold bg-transparent border-0 focus:outline-hidden text-stone-900 dark:text-stone-100"
                    placeholder="Note Title"
                  />
                </div>

                {/* Formatting Tools & View Modes */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => insertFormatting('# ')}
                    title="Heading 1"
                    className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 rounded hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <Heading1 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => insertFormatting('## ')}
                    title="Heading 2"
                    className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 rounded hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <Heading2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => insertFormatting('**', '**')}
                    title="Bold"
                    className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 rounded hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => insertFormatting('*', '*')}
                    title="Italic"
                    className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 rounded hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => insertFormatting('- [ ] ')}
                    title="Checklist item"
                    className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 rounded hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => insertFormatting('```\n', '\n```')}
                    title="Code block"
                    className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 rounded hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <Code className="w-3.5 h-3.5" />
                  </button>

                  <div className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-1" />

                  <div className="flex items-center gap-0.5 bg-stone-100 dark:bg-stone-800 p-0.5 rounded-md">
                    <button
                      onClick={() => setNoteViewMode('editor')}
                      title="Editor only"
                      className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
                        noteViewMode === 'editor'
                          ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-semibold shadow-2xs'
                          : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                      }`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>

                    <button
                      onClick={() => setNoteViewMode('split')}
                      title="Side-by-side split"
                      className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
                        noteViewMode === 'split'
                          ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-semibold shadow-2xs'
                          : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                      }`}
                    >
                      <Columns className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Split</span>
                    </button>

                    <button
                      onClick={() => setNoteViewMode('preview')}
                      title="Rendered preview"
                      className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
                        noteViewMode === 'preview'
                          ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-semibold shadow-2xs'
                          : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Preview</span>
                    </button>
                  </div>

                  <button
                    onClick={() => handleUpdateActiveNote({ pinned: !activeNote.pinned })}
                    title="Pin Note"
                    className={`p-1.5 rounded transition-colors ${
                      activeNote.pinned
                        ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/60'
                        : 'text-stone-400 hover:text-stone-700'
                    }`}
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDeleteNote(activeNote.id)}
                    title="Delete Note"
                    className="p-1.5 text-stone-400 hover:text-rose-600 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Editor & Preview Panes */}
              <div
                className={`flex-1 min-h-0 ${
                  noteViewMode === 'split'
                    ? 'grid grid-cols-1 md:grid-cols-2 divide-x divide-stone-200 dark:divide-stone-800'
                    : 'flex flex-col'
                }`}
              >
                {/* Editor Textarea */}
                {noteViewMode !== 'preview' && (
                  <div className="h-full flex flex-col flex-1">
                    <textarea
                      id="note-editor-textarea"
                      value={activeNote.content}
                      onChange={(e) => handleUpdateActiveNote({ content: e.target.value })}
                      className="w-full flex-1 p-5 text-sm font-mono leading-relaxed bg-transparent border-0 focus:outline-hidden text-stone-900 dark:text-stone-100 resize-none selection:bg-amber-500/30"
                      placeholder="Write your Markdown document here..."
                    />
                  </div>
                )}

                {/* Live Rich Markdown Preview with Interactive Checkboxes */}
                {noteViewMode !== 'editor' && (
                  <div className="h-full p-6 overflow-y-auto bg-stone-50/50 dark:bg-stone-950/50 flex-1">
                    <MarkdownPreview
                      content={activeNote.content}
                      onInternalLinkClick={handleInternalLinkClick}
                      onToggleTaskItem={handleToggleCheckboxInActiveNote}
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-stone-400">
              Select or create a note to begin editing.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
