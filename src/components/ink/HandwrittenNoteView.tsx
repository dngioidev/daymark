import { useCallback, useContext, useRef, useState, useSyncExternalStore } from 'react';
import type { InkPage, InkTool, StandaloneNote } from '../../types/daymark';
import { canWrite, rememberPen } from '../../ink/handwrittenNotes';
import { InkStoreContext } from '../../ink/inkStore';
import { HIGHLIGHTER_COLORS, PEN_COLORS } from '../../ink/inkColors';
import { InkCanvas, type EraserMode, type InkCanvasHandle } from './InkCanvas';
import { InkPageView } from './InkPageView';
import { InkToolbar, readEraserMode } from './InkToolbar';

export { canWrite, createHandwrittenNote, HANDWRITTEN_PLACEHOLDER } from '../../ink/handwrittenNotes';

export interface HandwrittenNoteViewProps {
  note: StandaloneNote;
  pages: InkPage[];
  onUpdatePage(page: InkPage): void;
}

export function HandwrittenNoteView({ note, pages: pagesProp, onUpdatePage }: HandwrittenNoteViewProps) {
  // With App's ink store, follow the live pages: App re-renders only after a writing pause, and a
  // stale `pages` prop must never reach the canvas (it would replace newer strokes).
  const store = useContext(InkStoreContext);
  const subscribe = useCallback((listener: () => void) => store ? store.subscribe(listener) : () => {}, [store]);
  const pages = useSyncExternalStore(subscribe, () => store ? store.pagesFor(note.id) : pagesProp);
  const [writable, setWritable] = useState(canWrite);
  const [selected, setSelected] = useState(0);
  const [tool, setTool] = useState<InkTool | 'eraser'>('pen');
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0]);
  const [highlightColor, setHighlightColor] = useState<string>(HIGHLIGHTER_COLORS[0]);
  const [penWidth, setPenWidth] = useState(4);
  const [highlightWidth, setHighlightWidth] = useState(24);
  const [eraserMode, setEraserMode] = useState<EraserMode>(readEraserMode);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const canvas = useRef<InkCanvasHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Ink entities use zero-based page numbers; the notebook labels start at 1.
  const count = Math.max(1, ...pages.map(page => page.page + 1));
  const number = Math.min(selected, count - 1);
  const emptyPage = (page: number): InkPage => ({ noteId: note.id, page, strokes: [], removed: [], updatedAt: note.updatedAt });
  const page = pages.find(page => page.page === number) ?? emptyPage(number);
  const navigate = (next: number) => {
    setSelected(next); setHistory({ undo: false, redo: false });
    scroller.current?.scrollTo?.({ top: 0 });
  };
  const color = tool === 'highlighter' ? highlightColor : penColor;
  const width = tool === 'highlighter' ? highlightWidth : tool === 'eraser' ? 24 : penWidth;
  return <section aria-label="Handwritten notebook" className="flex flex-1 min-h-0 min-w-0 flex-col text-stone-900 dark:text-stone-100"
    onPointerDownCapture={event => {
      if (event.pointerType === 'pen' && !writable) { rememberPen(); setWritable(true); }
    }}>
    {writable && <InkToolbar tool={tool} color={color} width={width}
      onToolChange={setTool} onColorChange={tool === 'highlighter' ? setHighlightColor : setPenColor}
      onWidthChange={tool === 'highlighter' ? setHighlightWidth : setPenWidth}
      onEraserModeChange={setEraserMode} onUndo={() => canvas.current?.undo()} onRedo={() => canvas.current?.redo()}
      canUndo={history.undo} canRedo={history.redo} />}
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-stone-200 dark:border-stone-800 p-2">
      <button type="button" className="min-h-11 px-2" disabled={number === 0} onClick={() => navigate(number - 1)}>Previous page</button>
      <span role="status">Page {number + 1} of {count}</span>
      <button type="button" className="min-h-11 px-2" disabled={number >= count - 1} onClick={() => navigate(number + 1)}>Next page</button>
      {writable && <button type="button" className="min-h-11 px-2" onClick={() => {
        if (!pages.some(page => page.page === number)) onUpdatePage(page);
        onUpdatePage({ ...emptyPage(count), updatedAt: new Date().toISOString() });
        navigate(count);
      }}>Add page</button>}
    </div>
    <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto p-2">
      {/* A single fixed page is mounted; turning pages releases its canvas buffers. */}
      {writable ? <InkCanvas key={`${note.id}:${number}`} ref={canvas} page={page} paper={note.paper}
        tool={tool} color={color} width={width} eraserMode={eraserMode} onChange={onUpdatePage}
        onHistoryChange={(undo, redo) => setHistory({ undo, redo })} />
        : <InkPageView key={`${note.id}:${number}`} page={page} paper={note.paper} />}
    </div>
  </section>;
}
